import path from 'path';
import { Storage } from '@google-cloud/storage';
import mammoth from 'mammoth';
// BUG FIX: Correctly import the default export for pdf-parse
import { PDFParse } from 'pdf-parse';
import { logger } from '../../../../shared/logger.js';
import ApiError from '../../../../errors/ApiError.js';
import httpStatus from 'http-status';
import {
  SUPPORTED_DOCUMENT_FORMATS,
  ERROR_MESSAGES,
  STORAGE_CONFIG,
} from '../translation.constant.js';

// Initialize Google Cloud Storage
let storage;
let bucket;

try {
  const keyFile = process.env.GCS_KEY_FILE;
  const projectId = process.env.GCP_PROJECT_ID;
  const bucketName = process.env.GCS_BUCKET_NAME;

  // The GCS client can be initialized with a key file path directly.
  // It will throw an error if the file is specified but not found or invalid.
  // If keyFile is undefined, it will fall back to other auth methods (like ADC).
  // This removes the need for fsSync.existsSync.
  if (keyFile || projectId) {
    storage = new Storage({
      keyFilename: keyFile,
      projectId: projectId,
    });
  } else {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('GCS credentials not configured (GCS_KEY_FILE or GCP_PROJECT_ID not set). Initializing mock storage client for development/testing.');
    } else {
      logger.error('CRITICAL: GCS credentials not configured (GCS_KEY_FILE or GCP_PROJECT_ID not set). Translation file processing will be unavailable.');
    }
    storage = new Storage();
  }

  if (storage && bucketName) {
    bucket = storage.bucket(bucketName || 'development-fallback-bucket');
  } else if (storage && !bucketName) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('GCS_BUCKET_NAME is not set. Initializing with a fallback bucket name for development/testing.');
    } else {
      logger.error('CRITICAL: GCS_BUCKET_NAME is not set. Translation file processing will be unavailable.');
    }
    bucket = storage.bucket('development-translation-bucket');
  }
} catch (error) {
  logger.error(
    'Failed to initialize Google Cloud Storage for translation:',
    error
  );
  // Log but don't re-throw — allow the app to start even if GCS is unavailable
}

// ============================================
// TEXT EXTRACTION FUNCTIONS (BUFFER-BASED)
// ============================================

/**
 * Extract text from PDF file buffer
 */
const extractTextFromPDF = async (fileBuffer) => {
  try {
    // pdf-parse works directly with buffers, avoiding filesystem reads.
    const pdfParser = new PDFParse({ data: fileBuffer });
    const data = await pdfParser.getText();
    return data.text;
  } catch (error) {
    logger.error('Error extracting text from PDF buffer:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from PDF'
    );
  }
};

/**
 * Extract text from DOCX file buffer
 */
const extractTextFromDOCX = async (fileBuffer) => {
  try {
    // mammoth can extract text directly from a buffer.
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } catch (error) {
    logger.error('Error extracting text from DOCX buffer:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from DOCX'
    );
  }
};

/**
 * Extract text from plain text file buffer
 */
const extractTextFromTXT = async (fileBuffer) => {
  try {
    // Buffers can be converted directly to strings.
    return fileBuffer.toString('utf-8');
  } catch (error) {
    logger.error('Error reading text file from buffer:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to read text file');
  }
};

/**
 * Extract text from XLSX file buffer
 */
const extractTextFromXLSX = async (fileBuffer) => {
  try {
    const XLSX = await import('xlsx');
    // The XLSX library reads directly from the provided buffer.
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    const sheetsText = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      sheetsText.push(XLSX.utils.sheet_to_csv(worksheet));
    }

    return sheetsText.join('\n\n');
  } catch (error) {
    logger.error('XLSX extraction error from buffer:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from XLSX file'
    );
  }
};

/**
 * Main function to extract text from any supported file type buffer.
 * This function is designed to work with in-memory file representations,
 * such as those provided by multer's memoryStorage engine, to ensure
 * the service remains stateless and does not write to the local filesystem.
 */
const extractTextFromFile = async (file) => {
  try {
    // The file object should contain the buffer and originalname.
    const fileBuffer = file.buffer;
    const originalName = file.originalname;
    const ext = path.extname(originalName).toLowerCase();

    logger.info(`Extracting text from in-memory file: ${originalName} (${ext})`);

    if (!SUPPORTED_DOCUMENT_FORMATS.includes(ext)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        ERROR_MESSAGES.UNSUPPORTED_FORMAT
      );
    }

    let text = '';

    switch (ext) {
      case '.pdf':
        text = await extractTextFromPDF(fileBuffer);
        break;
      case '.docx':
      case '.doc':
        text = await extractTextFromDOCX(fileBuffer);
        break;
      case '.txt':
      case '.md':
      case '.html':
      case '.json':
      case '.csv':
        text = await extractTextFromTXT(fileBuffer);
        break;
      case '.xlsx':
        text = await extractTextFromXLSX(fileBuffer);
        break;
      default:
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          ERROR_MESSAGES.UNSUPPORTED_FORMAT
        );
    }

    logger.info(
      `Successfully extracted ${text.length} characters from ${originalName}`
    );
    return text;
  } catch (error) {
    logger.error('Error in extractTextFromFile:', error);
    throw error;
  }
};

// ============================================
// GOOGLE CLOUD STORAGE FUNCTIONS (STATELESS)
// ============================================

/**
 * Generates a v4 signed URL for client-side uploads.
 * The client can use this URL to upload a file directly to GCS,
 * which is the recommended stateless pattern.
 */
const generateV4UploadSignedUrl = async (
  filename,
  contentType,
  documentMetadata = {}
) => {
  if (!storage || !bucket) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'GCS not configured'
    );
  }

  const bucketName = process.env.GCS_BUCKET_NAME;
  const destination = `${STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId || 'anonymous'}/${Date.now()}_${filename}`;

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: contentType,
    extensionHeaders: {
      'x-goog-meta-documenttype': documentMetadata.documentType || 'translation',
      'x-goog-meta-uploadedat': new Date().toISOString(),
      'x-goog-meta-userid': documentMetadata.userId || 'anonymous',
      'x-goog-meta-originalname': documentMetadata.originalName || filename,
      'x-goog-meta-targetlanguage': documentMetadata.targetLanguage || '',
      'x-goog-meta-sourcelanguage': documentMetadata.sourceLanguage || '',
    },
  };

  try {
    const [url] = await bucket.file(destination).getSignedUrl(options);
    logger.info(`Generated v4 signed URL for: ${destination}`);
    return {
      success: true,
      url,
      gcsPath: `gs://${bucketName}/${destination}`,
      destination,
    };
  } catch (error) {
    logger.error('Error generating v4 signed URL:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Could not create upload URL.'
    );
  }
};

/**
 * Streams a file buffer from the server's memory directly to Google Cloud Storage.
 * This is used when the server must proxy the file upload instead of using a signed URL.
 * It avoids writing the file to the local disk.
 */
const streamUploadToGCS = (fileBuffer, filename, documentMetadata = {}) => {
  return new Promise((resolve, reject) => {
    if (!storage || !bucket) {
      return reject(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'GCS not configured')
      );
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    const destination = `${STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId || 'anonymous'}/${Date.now()}_${filename}`;
    const file = bucket.file(destination);

    const stream = file.createWriteStream({
      resumable: false, // Use simple upload for in-memory buffers
      metadata: {
        contentType: getMimeType(filename),
        metadata: {
          documentType: documentMetadata.documentType || 'translation',
          uploadedAt: new Date().toISOString(),
          userId: documentMetadata.userId || 'anonymous',
          originalName: documentMetadata.originalName || filename,
          targetLanguage: documentMetadata.targetLanguage,
          sourceLanguage: documentMetadata.sourceLanguage,
        },
      },
    });

    stream.on('error', (err) => {
      logger.error(`Error streaming file to GCS at ${destination}:`, err);
      reject(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to upload file to GCS'
        )
      );
    });

    stream.on('finish', async () => {
      try {
        logger.info(`File streamed successfully to GCS: ${destination}`);
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        resolve({
          success: true,
          gcsPath: `gs://${bucketName}/${destination}`,
          publicUrl: signedUrl,
          fileName: filename,
          destination,
          storageType: 'gcs',
        });
      } catch (err) {
        logger.error(`Error generating signed URL for ${destination}:`, err);
        reject(
          new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            'File uploaded but failed to generate read URL'
          )
        );
      }
    });

    stream.end(fileBuffer);
  });
};

/**
 * Downloads a file from GCS directly into a memory buffer, avoiding local filesystem writes.
 */
const downloadFromGCSToBuffer = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'GCS not configured'
      );
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');

    logger.info(`Downloading file from GCS to buffer: ${filePath}`);

    // The download() method without a destination returns a buffer
    const [contents] = await bucket.file(filePath).download();

    logger.info(`File downloaded successfully from GCS to buffer.`);

    return {
      success: true,
      buffer: contents,
    };
  } catch (error) {
    logger.error('Error downloading file from GCS to buffer:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to download file from GCS'
    );
  }
};

/**
 * Delete file from Google Cloud Storage
 */
const deleteFromGCS = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');

    await bucket.file(filePath).delete();

    logger.info(`Translation file deleted from GCS: ${filePath}`);

    return { success: true, message: 'File deleted successfully from GCS' };
  } catch (error) {
    logger.error('Error deleting translation file from GCS:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Get MIME type from filename
 */
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

export const fileProcessor = {
  // Main text extraction entry point
  extractTextFromFile,
  // Individual extractors are exposed for potential direct use or testing
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  extractTextFromXLSX,
  // GCS operations for a stateless architecture
  generateV4UploadSignedUrl,
  streamUploadToGCS,
  downloadFromGCSToBuffer,
  deleteFromGCS,
  // Utilities
  getMimeType,
};