import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * Generate a text file from contract content
 */
export const generateTextFile = async (
  contractContent,
  fileName = 'contract.txt'
) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'contracts');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, fileName);

    // Write contract to file
    await fs.writeFile(filePath, contractContent, 'utf8');

    logger.info(`Text file generated: ${filePath}`);

    return {
      success: true,
      filePath,
      fileName,
      fileType: 'txt',
    };
  } catch (error) {
    logger.error('Error generating text file:', error);
    throw error;
  }
};

/**
 * Generate a DOCX file from contract content
 */
export const generateDocxFile = async (
  contractContent,
  fileName = 'contract.docx'
) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'contracts');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const filePath = path.join(outputDir, fileName);

    const children = [];
    const lines = contractContent.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('##')) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.replace(/#/g, '').trim(),
                bold: true,
                size: 24, // 12pt
              }),
            ],
            spacing: { before: 200, after: 100 },
          })
        );
      } else if (line.trim().startsWith('#')) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.replace(/#/g, '').trim(),
                bold: true,
                size: 28, // 14pt
              }),
            ],
            spacing: { before: 300, after: 150 },
          })
        );
      } else if (line.trim() === '') {
        children.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 100 },
          })
        );
      } else {
        let text = line;
        let bold = false;
        if (text.startsWith('**') && text.endsWith('**')) {
          text = text.replace(/\*\*/g, '');
          bold = true;
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                bold: bold,
                size: 20, // 10pt
              }),
            ],
            spacing: { after: 100 },
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
    await fs.writeFile(filePath, buffer);

    logger.info(`DOCX file generated successfully: ${filePath}`);

    return {
      success: true,
      filePath,
      fileName,
      fileType: 'docx',
    };
  } catch (error) {
    logger.error('Error generating DOCX file:', error);
    throw error;
  }
};

/**
 * Generate contract file based on format
 */
export const generateContractFile = async (
  contractContent,
  format = 'txt',
  metadata = {}
) => {
  try {
    const timestamp = Date.now();
    const contractType = metadata.contractType || 'contract';
    const userId = metadata.userId || 'anonymous';

    const fileName = `${contractType}_${timestamp}.${format}`;

    let result;

    if (format === 'docx' || format === 'doc') {
      result = await generateDocxFile(contractContent, fileName);
    } else {
      result = await generateTextFile(contractContent, fileName);
    }

    return {
      ...result,
      metadata: {
        contractType,
        userId,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error generating contract file:', error);
    throw error;
  }
};

/**
 * Clean up generated file
 */
export const cleanupContractFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`Cleaned up file: ${filePath}`);
    return { success: true };
  } catch (error) {
    logger.error('Error cleaning up file:', error);
    return { success: false, error: error.message };
  }
};
