import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse'; // Corrected import for pdf-parse library
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { rateLimit } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../../../../shared/config/redis.js'; // Assumes a configured Redis client is exported
import { logger } from '../../../../shared/logger.js';

/**
 * @description Rate limiter for file processing endpoints.
 * File parsing is a CPU and memory-intensive operation. A strict rate limit is crucial
 * to prevent DDOS attacks, API abuse, and resource exhaustion that could lead to server
 * instability or excessive costs. This limiter uses Redis for distributed environments.
 *
 * It should be applied as middleware to any Express route that utilizes the `processFile` service.
 *
 * @example
 * // In your router file (e.g., documentAnalysis.routes.js)
 * import { fileProcessingRateLimiter } from './services/fileProcessor';
 * router.post('/analyze-document', upload.single('document'), fileProcessingRateLimiter, analyzeDocumentController);
 */
export const fileProcessingRateLimiter = rateLimit({
  // Use Redis as the store to share rate limit state across multiple server instances.
  store: new RedisStore({
    // The `rate-limit-redis` library expects a function that can send commands to Redis.
    // This is compatible with both `ioredis` and `node-redis` clients.
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 file processing requests per 15-minute window.
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers.
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
  message: {
    status: 429,
    error: 'Too many requests',
    message:
      'You have made too many file processing requests. Please try again in 15 minutes.',
  },
  // A custom key generator can be used to rate limit based on user ID for authenticated users.
  // For this example, we default to the IP address.
  // keyGenerator: (req, res) => req.user ? req.user.id : req.ip,
});

/**
 * Extracts text content from a PDF file.
 * Uses the 'pdf-parse' library to process the file.
 * @param {string} filePath - The absolute path to the PDF file.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {Error} If the file cannot be read or if text extraction fails.
 */
const extractTextFromPDF = async (filePath) => {
  try {
    // Use asynchronous file reading to prevent blocking the Node.js event loop
    const dataBuffer = await fs.promises.readFile(filePath);
    // Correct usage of pdf-parse: it takes a buffer and returns a promise
    const parsedData = new PDFParse({ data: dataBuffer });
    const pdfResult = await parsedData.getText();

    // The extracted text is available directly in the 'text' property of the result
    const finalText = pdfResult.text;
    logger.info('PDF text extraction completed'); // Use logger for consistent logging
    return finalText;
  } catch (error) {
    logger.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF file');
  }
};

/**
 * Extracts raw text content from a DOCX file.
 * Uses the 'mammoth' library to process the file.
 * @param {string} filePath - The absolute path to the DOCX file.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {Error} If the file cannot be read or if text extraction fails.
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
 * Reads and returns the content of a plain text (TXT) file.
 * @param {string} filePath - The absolute path to the TXT file.
 * @returns {Promise<string>} A promise that resolves with the file's content.
 * @throws {Error} If the file cannot be read.
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
 * Extracts text content from an Excel file (XLSX or XLS).
 * It reads all sheets in the workbook and concatenates their text content.
 * Uses the 'xlsx' library for processing.
 * @param {string} filePath - The absolute path to the Excel file.
 * @returns {Promise<string>} A promise that resolves with the concatenated text from all sheets.
 * @throws {Error} If the file cannot be read or if text extraction fails.
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
 * Attempts to extract raw text content from a PowerPoint (PPTX) file.
 * Uses the 'mammoth' library, which has limited support for PPTX.
 * In case of failure, it returns a user-friendly message instead of throwing an error.
 * @param {string} filePath - The absolute path to the PPTX file.
 * @returns {Promise<string>} A promise that resolves with the extracted text or a fallback message on failure.
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
 * Processes an uploaded file to extract its text content.
 * It identifies the file type based on its extension and routes it to the appropriate text extraction function.
 * @param {object} fileInfo - An object containing file metadata, typically from a middleware like multer.
 * @param {string} fileInfo.path - The temporary path where the uploaded file is stored.
 * @param {string} [fileInfo.originalName] - The original name of the file.
 * @param {string} [fileInfo.filename] - The name of the file on the server.
 * @returns {Promise<string>} A promise that resolves with the extracted text content, trimmed of whitespace.
 * @throws {Error} If file information is invalid, the file type is unsupported, or an extraction error occurs.
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
 * Validates a file based on its size.
 * @param {object} fileInfo - An object containing file metadata.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {number} maxSize - The maximum allowed file size in bytes.
 * @returns {{valid: boolean, error?: string}} An object indicating if the file is valid. If not, it includes an error message.
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

/**
 * A service object containing a collection of functions for file processing and text extraction.
 * @namespace fileProcessor
 */
export const fileProcessor = {
  processFile,
  validateFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  extractTextFromExcel,
  extractTextFromPPTX,
};