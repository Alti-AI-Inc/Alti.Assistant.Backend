import fs from 'fs/promises';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../../../shared/logger.js';
import ApiError from '../../../../errors/ApiError.js';
import httpStatus from 'http-status';

/**
 * Extract text from PDF file
 */
const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = new PDFParse({
      data: dataBuffer,
    });
    const pdfContent = await data.getText();
    return pdfContent.text;
  } catch (error) {
    logger.error('Error extracting text from PDF:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to extract text from PDF');
  }
};

/**
 * Extract text from DOCX file
 */
const extractTextFromDOCX = async (filePath) => {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    logger.error('Error extracting text from DOCX:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to extract text from DOCX');
  }
};

/**
 * Extract text from plain text file
 */
const extractTextFromTXT = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    logger.error('Error reading text file:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to read text file');
  }
};

/**
 * Main function to extract text from any supported file type
 */
const extractTextFromFile = async (fileInfo) => {
  try {
    const filePath = fileInfo.path;
    const ext = path.extname(fileInfo.originalName).toLowerCase();

    logger.info(`Extracting text from file: ${fileInfo.originalName} (${ext})`);

    let text = '';

    switch (ext) {
      case '.pdf':
        text = await extractTextFromPDF(filePath);
        break;
      case '.docx':
        text = await extractTextFromDOCX(filePath);
        break;
      case '.doc':
        // For older .doc files, we'll try mammoth (it may not work for all)
        // In production, consider using a more robust solution
        text = await extractTextFromDOCX(filePath);
        break;
      case '.txt':
        text = await extractTextFromTXT(filePath);
        break;
      default:
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unsupported file type: ${ext}`
        );
    }

    logger.info(`Successfully extracted ${text.length} characters from ${fileInfo.originalName}`);
    return text;
  } catch (error) {
    logger.error('Error in extractTextFromFile:', error);
    throw error;
  }
};

/**
 * Clean up temporary file
 */
const cleanupFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    logger.info(`Cleaned up temporary file: ${filePath}`);
  } catch (error) {
    logger.warn(`Failed to cleanup file ${filePath}:`, error);
  }
};

export const fileProcessor = {
  extractTextFromFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  cleanupFile,
};
