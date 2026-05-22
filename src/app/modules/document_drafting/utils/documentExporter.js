import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { OUTPUT_FORMATS } from '../document.constant.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * Export document to PDF format
 */
const exportToPDF = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `document_${Date.now()}.pdf`;
    const filePath = path.join(outputDir, fileName);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 72,
            bottom: 72,
            left: 72,
            right: 72,
          },
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Add title if provided
        if (metadata.title) {
          doc.fontSize(20).font('Helvetica-Bold').text(metadata.title, {
            align: 'center',
          });
          doc.moveDown(1);
        }

        // Add date if requested
        if (metadata.includeDate) {
          const date = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          doc.fontSize(10).font('Helvetica').text(date, {
            align: 'right',
          });
          doc.moveDown(1);
        }

        // Add document metadata
        if (metadata.documentType) {
          doc
            .fontSize(10)
            .font('Helvetica-Oblique')
            .text(`Type: ${metadata.documentType}`, {
              align: 'right',
            });
          doc.moveDown(0.5);
        }

        doc.moveDown(1);

        // Add main content
        doc.fontSize(11).font('Helvetica').text(content, {
          align: 'left',
          lineGap: 4,
        });

        // Finalize PDF
        doc.end();

        stream.on('finish', () => {
          logger.info(`PDF document created successfully: ${filePath}`);
          resolve({
            filePath,
            fileName,
            format: OUTPUT_FORMATS.PDF,
            size: fs.statSync(filePath).size,
          });
        });

        stream.on('error', (error) => {
          logger.error('Error writing PDF:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Error creating PDF document:', error);
        reject(error);
      }
    });
  } catch (error) {
    logger.error('Error in exportToPDF:', error);
    throw error;
  }
};

/**
 * Export document to DOCX format (placeholder - needs docx library)
 * Note: This is a simplified version. For production, use 'docx' npm package
 */
const exportToDocx = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `document_${Date.now()}.docx`;
    const filePath = path.join(outputDir, fileName);

    const children = [];

    // Title paragraph
    if (metadata.title) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: metadata.title,
              bold: true,
              size: 32, // 16pt
            }),
          ],
          spacing: { after: 300 },
        })
      );
    }

    // Date & type metadata paragraph
    const metaRuns = [];
    if (metadata.includeDate) {
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      metaRuns.push(new TextRun({ text: `Date: ${date}`, italics: true }));
    }
    if (metadata.documentType) {
      if (metaRuns.length > 0) {
        metaRuns.push(new TextRun({ text: '  |  ', italics: true }));
      }
      metaRuns.push(new TextRun({ text: `Type: ${metadata.documentType}`, italics: true }));
    }

    if (metaRuns.length > 0) {
      children.push(
        new Paragraph({
          children: metaRuns,
          spacing: { after: 400 },
        })
      );
    }

    // Add main content paragraphs
    const contentLines = content.split('\n');
    for (const line of contentLines) {
      if (line.trim() === '') {
        children.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 150 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 22, // 11pt
              }),
            ],
            spacing: { after: 150 },
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);

    logger.info(`DOCX document created successfully: ${filePath}`);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.DOCX,
      size: fs.statSync(filePath).size,
    };
  } catch (error) {
    logger.error('Error in exportToDocx:', error);
    throw error;
  }
};

/**
 * Export document to TXT format
 */
const exportToTxt = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `document_${Date.now()}.txt`;
    const filePath = path.join(outputDir, fileName);

    let documentContent = '';

    if (metadata.title) {
      documentContent += `${metadata.title}\n`;
      documentContent += '='.repeat(metadata.title.length) + '\n\n';
    }

    if (metadata.includeDate) {
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      documentContent += `Date: ${date}\n\n`;
    }

    if (metadata.documentType) {
      documentContent += `Document Type: ${metadata.documentType}\n\n`;
    }

    documentContent += content;

    fs.writeFileSync(filePath, documentContent, 'utf8');

    logger.info(`TXT document created successfully: ${filePath}`);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.TXT,
      size: fs.statSync(filePath).size,
    };
  } catch (error) {
    logger.error('Error in exportToTxt:', error);
    throw error;
  }
};

/**
 * Export document to HTML format
 */
const exportToHtml = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `document_${Date.now()}.html`;
    const filePath = path.join(outputDir, fileName);

    // Format content with line breaks
    const formattedContent = content.replace(/\n/g, '<br>');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title || 'Document'}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        .meta {
            color: #7f8c8d;
            font-size: 0.9em;
            margin-bottom: 20px;
        }
        .content {
            text-align: justify;
        }
    </style>
</head>
<body>
    ${metadata.title ? `<h1>${metadata.title}</h1>` : ''}
    <div class="meta">
        ${metadata.includeDate ? `<p>Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
        ${metadata.documentType ? `<p>Type: ${metadata.documentType}</p>` : ''}
    </div>
    <div class="content">
        ${formattedContent}
    </div>
</body>
</html>`;

    fs.writeFileSync(filePath, htmlContent, 'utf8');

    logger.info(`HTML document created successfully: ${filePath}`);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.HTML,
      size: fs.statSync(filePath).size,
    };
  } catch (error) {
    logger.error('Error in exportToHtml:', error);
    throw error;
  }
};

/**
 * Export document to Markdown format
 */
const exportToMarkdown = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `document_${Date.now()}.md`;
    const filePath = path.join(outputDir, fileName);

    let markdownContent = '';

    if (metadata.title) {
      markdownContent += `# ${metadata.title}\n\n`;
    }

    if (metadata.includeDate || metadata.documentType) {
      markdownContent += '---\n';
      if (metadata.includeDate) {
        const date = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        markdownContent += `**Date:** ${date}\n\n`;
      }
      if (metadata.documentType) {
        markdownContent += `**Type:** ${metadata.documentType}\n\n`;
      }
      markdownContent += '---\n\n';
    }

    markdownContent += content;

    fs.writeFileSync(filePath, markdownContent, 'utf8');

    logger.info(`Markdown document created successfully: ${filePath}`);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.MD,
      size: fs.statSync(filePath).size,
    };
  } catch (error) {
    logger.error('Error in exportToMarkdown:', error);
    throw error;
  }
};

/**
 * Main export function that routes to appropriate exporter
 */
export const exportDocument = async (content, format, metadata = {}) => {
  try {
    logger.info(`Exporting document to ${format} format`);

    switch (format.toLowerCase()) {
      case OUTPUT_FORMATS.PDF:
        return await exportToPDF(content, metadata);
      case OUTPUT_FORMATS.DOCX:
      case OUTPUT_FORMATS.DOC:
        return await exportToDocx(content, metadata);
      case OUTPUT_FORMATS.TXT:
        return await exportToTxt(content, metadata);
      case OUTPUT_FORMATS.HTML:
        return await exportToHtml(content, metadata);
      case OUTPUT_FORMATS.MD:
        return await exportToMarkdown(content, metadata);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  } catch (error) {
    logger.error('Error exporting document:', error);
    throw error;
  }
};
