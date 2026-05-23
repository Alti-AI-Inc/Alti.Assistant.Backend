import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { ragService } from './llamaindex.service.js';

export const uploadAndIndexDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const result = await ragService.uploadAndIndexDocumentService(filePath, originalName, userId);

    // Optional: delete temp file
    await fs.unlink(filePath);

    res.status(200).json({ message: 'Document indexed', result });
  } catch (error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(413)
        .json({ error: 'File too large. Maximum allowed size is 1MB.' });
    }
    res.status(500).json({ error: error.message });
  }
};

export const queryIndex = async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const answer = await ragService.queryDocument(query, userId);
    res.status(200).json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const exportSessionPDF = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || 'default_user';
    const persistDir = path.resolve(`storage/ragsystem/${userId}`);
    const historyPath = path.join(persistDir, 'chat_history.json');
    const profilePath = path.join(persistDir, 'document_profile.json');

    if (!existsSync(historyPath)) {
      return res.status(400).json({ error: 'No active chat history found to export.' });
    }

    const historyData = await fs.readFile(historyPath, 'utf-8');
    const chatHistory = JSON.parse(historyData);

    let docProfile = null;
    if (existsSync(profilePath)) {
      const profileData = await fs.readFile(profilePath, 'utf-8');
      docProfile = JSON.parse(profileData);
    }

    // Set Response Headers for PDF Download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Alti_RAG_Analysis_${Date.now()}.pdf"`);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(res);

    // Styling Tokens
    const primaryColor = '#1E3A8A'; // Deep Navy
    const secondaryColor = '#0F766E'; // Teal
    const textColor = '#1F2937'; // Slate Dark
    const lightBg = '#F3F4F6'; // Cool Gray
    const accentBg = '#F0FDFA'; // Premium Light Mint
    const strokeColor = '#E5E7EB'; // Border light

    // 1. Premium Header Banner
    doc.rect(0, 0, 595.28, 80).fill(primaryColor);
    doc.fillColor('#FFFFFF')
       .font('Helvetica-Bold')
       .fontSize(22)
       .text('ALTI RAG ANALYSIS REPORT', 50, 25);
    doc.fontSize(10)
       .font('Helvetica')
       .text(`Session Report | User ID: ${userId} | Compiled: ${new Date().toLocaleDateString()}`, 50, 52);

    // Spacer
    doc.moveDown(4);

    // 2. Global Document Profiling summary if available
    if (docProfile) {
      doc.fillColor(primaryColor)
         .font('Helvetica-Bold')
         .fontSize(14)
         .text('Document Profile Overview');
      
      doc.moveDown(0.4);
      
      // Draw light box background for Profile
      doc.rect(50, doc.y, 495.28, 70).fill(lightBg);
      doc.fillColor(textColor)
         .font('Helvetica-Oblique')
         .fontSize(10)
         .text(docProfile.summary, 60, doc.y + 10, { width: 475.28 });
         
      doc.moveDown(5);
    }

    // 3. Dialogue Stream
    doc.fillColor(primaryColor)
       .font('Helvetica-Bold')
       .fontSize(14)
       .text('Conversation Dialogue History');
    doc.moveDown(0.8);

    for (const turn of chatHistory) {
      const isUser = turn.role === 'user';
      const senderName = isUser ? 'User Inquiry' : 'Alti real-time AI analyst';
      const boxColor = isUser ? lightBg : accentBg;
      const borderTheme = isUser ? strokeColor : '#A7F3D0';
      const containerPadding = 24;
      
      // Calculate content dimensions dynamically
      doc.font('Helvetica').fontSize(9.5);
      const textHeight = doc.heightOfString(turn.content, { width: 450 });
      const containerHeight = textHeight + containerPadding;

      // Check if container overflows current page margins, trigger manual page break if needed
      if (doc.y + containerHeight > 750) {
        doc.addPage();
      }

      const boxY = doc.y;
      
      // Draw styled box block
      doc.rect(50, boxY, 495.28, containerHeight).fill(boxColor);
      doc.rect(50, boxY, 495.28, containerHeight).stroke(borderTheme);

      // Render role label
      doc.fillColor(isUser ? primaryColor : secondaryColor)
         .font('Helvetica-Bold')
         .fontSize(9)
         .text(senderName.toUpperCase(), 62, boxY + 8);

      // Render content
      doc.fillColor(textColor)
         .font('Helvetica')
         .fontSize(9.5)
         .text(turn.content, 62, boxY + 20, { width: 470, align: 'justify' });

      doc.moveDown(2.5);
    }

    // Footer copyright banner
    doc.moveDown(3);
    doc.fontSize(8)
       .fillColor('#9CA3AF')
       .text('CONFIDENTIAL | Powered by Alti & LlamaIndex Cognitive RAG Platform © 2026', { align: 'center' });

    doc.end();

  } catch (err) {
    console.error('PDF Export Controller error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: `Failed to compile and export PDF report: ${err.message}` });
    }
  }
};
