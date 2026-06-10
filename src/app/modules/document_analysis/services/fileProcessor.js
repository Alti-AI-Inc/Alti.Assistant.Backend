import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse'; // Corrected import for pdf-parse library
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { logger } from '../../../../shared/logger.js';

/**
 * Extract text from PDF file
 */
const extractTextFromPDF = async (filePath) => {
  try {
    // Use asynchronous file reading to prevent blocking the Node.js event loop
    const dataBuffer = await fs.promises.readFile(filePath);
    // Correct usage of pdf-parse: it takes a buffer and returns a promise
    const parsedData = await pdfParse(dataBuffer);

    // The extracted text is available directly in the 'text' property of the result
    const finalText = parsedData.text;
    logger.info('PDF text extraction completed'); // Use logger for consistent logging
    return finalText;
  } catch (error) {
    logger.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF file');
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
    throw new Error('Failed to extract text from DOCX file');
  }
};

/**
 * Extract text from TXT file
 */
const extractTextFromTXT = async (filePath) => {
  try {
    // Use asynchronous file reading to prevent blocking the Node.js event loop
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    logger.error('Error reading TXT file:', error);
    throw new Error('Failed to read TXT file');
  }
};

/**
 * Extract text from Excel file
 */
const extractTextFromExcel = async (filePath) => {
  try {
    // Read the file asynchronously first to prevent blocking the event loop
    const dataBuffer = await fs.promises.readFile(filePath);
    // Use xlsx.read with the buffer for asynchronous processing
    const workbook = xlsx.read(dataBuffer, { type: 'buffer' });
    let text = '';

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      text += `\n--- Sheet: ${sheetName} ---\n`;
      text += xlsx.utils.sheet_to_txt(worksheet);
    });

    return text;
  } catch (error) {
    logger.error('Error extracting text from Excel:', error);
    throw new Error('Failed to extract text from Excel file');
  }
};

/**
 * Extract text from PowerPoint file
 */
const extractTextFromPPTX = async (filePath) => {
  try {
    // For PPTX, we'll use mammoth which can extract some text
    // Note: For better PPTX support, consider using a dedicated library
    const result = await mammoth.extractRawText({ path: filePath });
    return (
      result.value ||
      'Unable to extract text from PowerPoint file. Please use PDF export for better results.'
    );
  } catch (error) {
    logger.error('Error extracting text from PPTX:', error);
    // Return a message instead of throwing to allow graceful degradation
    return 'Unable to extract text from PowerPoint file. Please export as PDF for analysis.';
  }
};

/**
 * Main file processor - routes to appropriate extractor based on file type
 */
const processFile = async (fileInfo) => {
  if (!fileInfo || !fileInfo.path) {
    throw new Error('Invalid file information');
  }

  const ext = path
    .extname(fileInfo.originalName || fileInfo.filename)
    .toLowerCase();
  logger.info(
    `Processing file: ${fileInfo.originalName || fileInfo.filename} (${ext})`
  );

  let extractedText = '';

  try {
    switch (ext) {
      case '.pdf':
        extractedText = await extractTextFromPDF(fileInfo.path);
        break;
      case '.docx':
      case '.doc': // Note: mammoth might not fully support older .doc files, but it's included for completeness.
        extractedText = await extractTextFromDOCX(fileInfo.path);
        break;
      case '.txt':
        extractedText = await extractTextFromTXT(fileInfo.path);
        break;
      case '.xlsx':
      case '.xls': // Note: xlsx library supports both .xlsx and older .xls formats.
        extractedText = await extractTextFromExcel(fileInfo.path);
        break;
      case '.pptx':
      case '.ppt': // Note: mammoth might not fully support older .ppt files, but it's included for completeness.
        extractedText = await extractTextFromPPTX(fileInfo.path);
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    logger.info(
      `Successfully extracted ${extractedText.length} characters from file`
    );
    return extractedText.trim();
  } catch (error) {
    logger.error('File processing error:', error);
    throw error;
  }
};

/**
 * Validate file size and type
 */
const validateFile = (fileInfo, maxSize) => {
  if (!fileInfo) {
    return { valid: false, error: 'No file provided' };
  }

  if (fileInfo.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`,
    };
  }

  return { valid: true };
};

export const fileProcessor = {
  processFile,
  validateFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  extractTextFromExcel,
  extractTextFromPPTX,
};