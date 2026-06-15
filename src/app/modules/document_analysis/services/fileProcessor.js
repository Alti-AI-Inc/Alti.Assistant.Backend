import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import { redisClient } from '../../../../shared/redis.js';
import { logger } from '../../../../shared/logger.js';

// --- Google Cloud Storage Integration ---

// Initialize Google Cloud Storage.
// This requires the GOOGLE_APPLICATION_CREDENTIALS environment variable to be set
// with the path to your service account key file.
// See: https://cloud.google.com/docs/authentication/getting-started
const storage = new Storage();

// The GCS bucket name should be configured via an environment variable.
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

if (!GCS_BUCKET_NAME) {
  // Log a warning if the bucket name is not set. File archival will be disabled.
  logger.warn(
    'GCS_BUCKET_NAME environment variable not set. File archival to Cloud Storage will be skipped.'
  );
}

/**
 * @description Uploads a file buffer to a GCS bucket. This function streams the buffer
 * directly to GCS without writing to the local filesystem.
 * @param {object} file - The file object, typically from multer's memory storage.
 * @param {Buffer} file.buffer - The file content as a buffer.
 * @param {string} file.originalname - The original name of the file.
 * @param {string} file.mimetype - The MIME type of the file.
 * @returns {Promise<string>} A promise that resolves with the GCS URI (gs://...) of the uploaded file.
 * @throws {Error} If the upload fails or the bucket is not configured.
 */
const uploadBufferToGCS = async ({ buffer, originalname, mimetype }) => {
  if (!GCS_BUCKET_NAME) {
    throw new Error('GCS bucket name is not configured for upload.');
  }
  const bucket = storage.bucket(GCS_BUCKET_NAME);
  // Create a unique filename using a timestamp to avoid overwrites.
  const destination = `uploads/${Date.now()}-${path.basename(originalname)}`;
  const gcsFile = bucket.file(destination);

  return new Promise((resolve, reject) => {
    // Create a write stream to the GCS file.
    const stream = gcsFile.createWriteStream({
      metadata: {
        contentType: mimetype,
      },
      // Use simple upload for smaller files, which is faster than resumable.
      resumable: false,
    });

    stream.on('error', (err) => {
      logger.error(`GCS upload error for ${destination}:`, err);
      reject(new Error('Failed to upload file to Cloud Storage.'));
    });

    stream.on('finish', () => {
      const gcsUri = `gs://${GCS_BUCKET_NAME}/${destination}`;
      logger.info(`File successfully uploaded to ${gcsUri}`);
      resolve(gcsUri);
    });

    // End the stream by writing the buffer to it.
    stream.end(buffer);
  });
};

/**
 * Generates a signed URL for a file in GCS, allowing temporary, secure read access.
 * @param {string} gcsUri - The GCS URI of the file (e.g., 'gs://my-bucket/uploads/file.pdf').
 * @param {number} [durationMinutes=15] - The duration in minutes for which the URL will be valid.
 * @returns {Promise<string>} A promise that resolves with the signed URL.
 * @throws {Error} If the GCS URI is invalid or URL generation fails.
 */
const getSignedUrlForGcsFile = async (gcsUri, durationMinutes = 15) => {
  const matches = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!matches) {
    throw new Error(
      'Invalid GCS URI format. Expected gs://<bucket-name>/<file-path>.'
    );
  }
  const [, bucketName, filePath] = matches;

  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + durationMinutes * 60 * 1000,
  };

  try {
    const [url] = await storage
      .bucket(bucketName)
      .file(filePath)
      .getSignedUrl(options);
    logger.info(`Generated signed URL for ${gcsUri}`);
    return url;
  } catch (error) {
    logger.error(`Failed to generate signed URL for ${gcsUri}:`, error);
    throw new Error('Could not generate signed URL for the file.');
  }
};

import { createRateLimiter } from '../../../../shared/rateLimiter.js';

// --- Rate Limiting ---

/**
 * @description Rate limiter for file processing endpoints.
 * File parsing is a CPU and memory-intensive operation. A strict rate limit is crucial
 * to prevent DDOS attacks, API abuse, and resource exhaustion.
 */
export const fileProcessingRateLimiter = createRateLimiter({
  keyPrefix: 'file_processing',
  points: 20, // Limit each IP to 20 file processing requests per window.
  duration: 15 * 60, // 15 minutes in seconds
  errorMessage: 'You have made too many file processing requests. Please try again in 15 minutes.',
});

// --- Text Extraction Services (Refactored to use Buffers) ---

/**
 * Extracts text content from a PDF file buffer.
 * @param {Buffer} fileBuffer - The buffer containing the PDF file data.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {Error} If text extraction fails.
 */
const extractTextFromPDF = async (fileBuffer) => {
  try {
    const parsedData = new PDFParse({ data: fileBuffer });
    const pdfResult = await parsedData.getText();
    const finalText = pdfResult.text;
    logger.info('PDF text extraction completed');
    return finalText;
  } catch (error) {
    logger.error('Error extracting text from PDF buffer:', error);
    throw new Error('Failed to extract text from PDF file');
  }
};

/**
 * Extracts raw text content from a DOCX file buffer.
 * @param {Buffer} fileBuffer - The buffer containing the DOCX file data.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {Error} If text extraction fails.
 */
const extractTextFromDOCX = async (fileBuffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } catch (error) {
    logger.error('Error extracting text from DOCX buffer:', error);
    throw new Error('Failed to extract text from DOCX file');
  }
};

/**
 * Reads and returns the content of a plain text (TXT) file buffer.
 * @param {Buffer} fileBuffer - The buffer containing the TXT file data.
 * @returns {Promise<string>} A promise that resolves with the file's content.
 * @throws {Error} If the buffer cannot be converted.
 */
const extractTextFromTXT = async (fileBuffer) => {
  try {
    return fileBuffer.toString('utf8');
  } catch (error) {
    logger.error('Error reading TXT buffer:', error);
    throw new Error('Failed to read TXT file');
  }
};

/**
 * Extracts text content from an Excel file (XLSX or XLS) buffer.
 * @param {Buffer} fileBuffer - The buffer containing the Excel file data.
 * @returns {Promise<string>} A promise that resolves with the concatenated text from all sheets.
 * @throws {Error} If text extraction fails.
 */
const extractTextFromExcel = async (fileBuffer) => {
  try {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    let text = '';

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      text += `\n--- Sheet: ${sheetName} ---\n`;
      text += xlsx.utils.sheet_to_txt(worksheet);
    });

    return text;
  } catch (error) {
    logger.error('Error extracting text from Excel buffer:', error);
    throw new Error('Failed to extract text from Excel file');
  }
};

/**
 * Extracts raw text content from a PowerPoint (PPTX) file buffer.
 * @param {Buffer} fileBuffer - The buffer containing the PPTX file data.
 * @returns {Promise<string>} A promise that resolves with the extracted text or a fallback message on failure.
 */
const extractTextFromPPTX = async (fileBuffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return (
      result.value ||
      'Unable to extract text from PowerPoint file. Please use PDF export for better results.'
    );
  } catch (error) {
    logger.error('Error extracting text from PPTX buffer:', error);
    return 'Unable to extract text from PowerPoint file. Please export as PDF for analysis.';
  }
};

// --- Main Service Logic ---

/**
 * Processes an uploaded file from a buffer to extract its text content and archives the original file to GCS.
 * This function is designed to work with multer's memoryStorage, which provides the file as a buffer in `req.file`.
 * @param {object} file - The file object from multer, containing the buffer and metadata.
 * @param {Buffer} file.buffer - The file content.
 * @param {string} file.originalname - The original name of the file.
 * @param {string} file.mimetype - The MIME type of the file.
 * @returns {Promise<{extractedText: string, gcsUri: string|null}>} A promise that resolves with the extracted text and the GCS URI of the archived file (or null if archival is disabled).
 * @throws {Error} If file information is invalid, the file type is unsupported, or an extraction error occurs.
 */
const processFile = async (file) => {
  if (!file || !file.buffer) {
    throw new Error('Invalid file information: buffer is missing.');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  logger.info(`Processing file: ${file.originalname} (${ext})`);

  let textExtractionPromise;

  switch (ext) {
    case '.pdf':
      textExtractionPromise = extractTextFromPDF(file.buffer);
      break;
    case '.docx':
    case '.doc':
      textExtractionPromise = extractTextFromDOCX(file.buffer);
      break;
    case '.txt':
      textExtractionPromise = extractTextFromTXT(file.buffer);
      break;
    case '.xlsx':
    case '.xls':
      textExtractionPromise = extractTextFromExcel(file.buffer);
      break;
    case '.pptx':
    case '.ppt':
      textExtractionPromise = extractTextFromPPTX(file.buffer);
      break;
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }

  // Concurrently extract text and upload the original file to GCS for archival.
  try {
    const [extractedText, gcsUri] = await Promise.all([
      textExtractionPromise,
      // Only attempt upload if the bucket name is configured
      GCS_BUCKET_NAME ? uploadBufferToGCS(file) : Promise.resolve(null),
    ]);

    logger.info(
      `Successfully extracted ${extractedText.length} characters from file. Archived at: ${gcsUri || 'skipped'}`
    );
    return { extractedText: extractedText.trim(), gcsUri };
  } catch (error) {
    logger.error('File processing or GCS upload error:', error);
    // Re-throw the original error to be handled by the caller
    throw error;
  }
};

/**
 * Validates a file based on its size.
 * @param {object} fileInfo - An object containing file metadata.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {number} maxSize - The maximum allowed file size in bytes.
 * @returns {{valid: boolean, error?: string}} An object indicating if the file is valid.
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
  uploadBufferToGCS,
  getSignedUrlForGcsFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  extractTextFromExcel,
  extractTextFromPPTX,
};