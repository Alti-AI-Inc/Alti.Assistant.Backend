import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import mammoth from 'mammoth';
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

  if (keyFile && fsSync.existsSync(keyFile)) {
    storage = new Storage({
      keyFilename: keyFile,
      projectId: projectId,
    });
  } else if (projectId) {
    storage = new Storage({
      projectId: projectId,
    });
  } else {
    logger.warn('GCS credentials not configured. Translation file uploads will be stored locally only.');
  }

  if (storage && bucketName) {
    bucket = storage.bucket(bucketName);
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage for translation:', error);
}

// ============================================
// TEXT EXTRACTION FUNCTIONS
// ============================================

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
 * Extract text from XLSX files
 */
const extractTextFromXLSX = async (filePath) => {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(filePath);
    let text = '';

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      text += XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
    });

    return text;
  } catch (error) {
    logger.error('XLSX extraction error:', error);
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to extract text from XLSX file');
  }
};

/**
 * Main function to extract text from any supported file type
 */
const extractTextFromFile = async (fileInfo) => {
  try {
    const filePath = fileInfo.path;
    const originalName = fileInfo.originalName || fileInfo.originalname;
    const ext = path.extname(originalName).toLowerCase();

    logger.info(`Extracting text from file: ${originalName} (${ext})`);

    if (!SUPPORTED_DOCUMENT_FORMATS.includes(ext)) {
      throw new ApiError(httpStatus.BAD_REQUEST, ERROR_MESSAGES.UNSUPPORTED_FORMAT);
    }

    let text = '';

    switch (ext) {
      case '.pdf':
        text = await extractTextFromPDF(filePath);
        break;
      case '.docx':
      case '.doc':
        text = await extractTextFromDOCX(filePath);
        break;
      case '.txt':
      case '.md':
      case '.html':
      case '.json':
      case '.csv':
        text = await extractTextFromTXT(filePath);
        break;
      case '.xlsx':
        text = await extractTextFromXLSX(filePath);
        break;
      default:
        throw new ApiError(httpStatus.BAD_REQUEST, ERROR_MESSAGES.UNSUPPORTED_FORMAT);
    }

    logger.info(`Successfully extracted ${text.length} characters from ${originalName}`);
    return text;
  } catch (error) {
    logger.error('Error in extractTextFromFile:', error);
    throw error;
  }
};

// ============================================
// GOOGLE CLOUD STORAGE FUNCTIONS
// ============================================

/**
 * Upload file to Google Cloud Storage and return signed URL
 */
const uploadToGCS = async (localFilePath, filename, documentMetadata = {}) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Returning local file path.');
      return {
        success: true,
        localPath: localFilePath,
        fileName: filename,
        storageType: 'local',
      };
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    const destination = `${STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId || 'anonymous'}/${Date.now()}_${filename}`;

    logger.info(`Uploading translation file to GCS: ${destination}`);

    // Upload file
    await bucket.upload(localFilePath, {
      destination,
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

    // Generate signed URL (valid for 7 days)
    const file = bucket.file(destination);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info(`Translation file uploaded successfully to GCS: ${destination}`);

    return {
      success: true,
      gcsPath: `gs://${bucketName}/${destination}`,
      publicUrl: signedUrl,
      fileName: filename,
      destination,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error uploading translation file to GCS:', error);

    // Return local path as fallback
    return {
      success: true,
      localPath: localFilePath,
      fileName: filename,
      storageType: 'local',
      error: error.message,
    };
  }
};

/**
 * Download file from GCS to a temporary local path
 */
const downloadFromGCS = async (gcsPath, tempLocalPath) => {
  try {
    if (!storage || !bucket) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'GCS not configured');
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');

    logger.info(`Downloading file from GCS: ${filePath}`);

    await bucket.file(filePath).download({
      destination: tempLocalPath,
    });

    logger.info(`File downloaded successfully from GCS to: ${tempLocalPath}`);

    return {
      success: true,
      localPath: tempLocalPath,
    };
  } catch (error) {
    logger.error('Error downloading file from GCS:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to download file from GCS');
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
 * Clean up temporary file
 */
const cleanupFile = async (filePath) => {
  try {
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
      logger.info(`Cleaned up temporary file: ${filePath}`);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup file ${filePath}:`, error);
  }
};

/**
 * Get MIME type from filename
 */
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

export const fileProcessor = {
  extractTextFromFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  extractTextFromXLSX,
  cleanupFile,
  uploadToGCS,
  downloadFromGCS,
  deleteFromGCS,
  getMimeType,
};
