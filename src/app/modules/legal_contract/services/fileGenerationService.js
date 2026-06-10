import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * @file This service provides functions for generating and managing contract files in various formats.
 * It supports generating plain text (.txt) and DOCX (.docx) files from contract content.
 */

/**
 * @typedef {object} FileGenerationResult
 * @property {boolean} success - Indicates if the file generation was successful.
 * @property {string} filePath - The absolute path to the generated file.
 * @property {string} fileName - The name of the generated file.
 * @property {string} fileType - The type/extension of the generated file (e.g., 'txt', 'docx').
 */

/**
 * Generates a plain text file from the provided contract content.
 * The file will be saved in a designated output directory.
 *
 * @async
 * @param {string} contractContent - The string content of the contract to be written to the file.
 * @param {string} [fileName='contract.txt'] - The desired name for the output text file.
 * @returns {Promise<FileGenerationResult>} An object containing the success status, file path, file name, and file type.
 * @throws {Error} If there is an error during directory creation or file writing.
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
 * Generates a DOCX (Microsoft Word) file from the provided contract content.
 * The content is parsed to apply basic formatting like headings (using # and ##) and bold text (using **text**).
 * The file will be saved in a designated output directory.
 *
 * @async
 * @param {string} contractContent - The string content of the contract, potentially with markdown-like formatting.
 * @param {string} [fileName='contract.docx'] - The desired name for the output DOCX file.
 * @returns {Promise<FileGenerationResult>} An object containing the success status, file path, file name, and file type.
 * @throws {Error} If there is an error during directory creation, DOCX generation, or file writing.
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
 * Generates a contract file based on the specified format (txt or docx).
 * It automatically determines the appropriate generation function and constructs a unique file name.
 *
 * @async
 * @param {string} contractContent - The content of the contract to be written.
 * @param {'txt'|'docx'|'doc'} [format='txt'] - The desired output format for the contract file.
 * @param {object} [metadata={}] - Additional metadata to include in the file name and return object.
 * @param {string} [metadata.contractType='contract'] - The type of contract (e.g., 'NDA', 'SOW'). Used in file name.
 * @param {string} [metadata.userId='anonymous'] - The ID of the user generating the contract. Used in file name.
 * @returns {Promise<FileGenerationResult & { metadata: object }>} An object containing the file generation result and extended metadata.
 * @throws {Error} If an error occurs during the file generation process by `generateTextFile` or `generateDocxFile`.
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
 * Deletes a generated contract file from the file system.
 *
 * @async
 * @param {string} filePath - The absolute path to the file to be deleted.
 * @returns {Promise<{success: boolean, error?: string}>} An object indicating the success status and an error message if deletion failed.
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