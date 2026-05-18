import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../../../shared/logger.js';
import ApiError from '../../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { STORAGE_CONFIG } from '../document_review.constant.js';

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
    logger.warn(
      'GCS credentials not configured. Document uploads will be stored locally only.'
    );
  }

  if (storage && bucketName) {
    bucket = storage.bucket(bucketName);
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

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
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from PDF'
    );
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
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from DOCX'
    );
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

    logger.info(
      `Successfully extracted ${text.length} characters from ${fileInfo.originalName}`
    );
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

    logger.info(`Uploading file to GCS: ${destination}`);

    // Upload file
    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType: getMimeType(filename),
        metadata: {
          documentType: documentMetadata.documentType || 'review',
          uploadedAt: new Date().toISOString(),
          userId: documentMetadata.userId || 'anonymous',
          originalName: documentMetadata.originalName || filename,
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

    logger.info(`File uploaded successfully to GCS: ${destination}`);

    return {
      success: true,
      gcsPath: `gs://${bucketName}/${destination}`,
      publicUrl: signedUrl,
      fileName: filename,
      destination,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error uploading to GCS:', error);

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
 * Delete document from Google Cloud Storage
 */
const deleteDocumentFromGCS = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    // Extract file path from gs:// URL
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');

    await bucket.file(filePath).delete();

    logger.info(`Document deleted from GCS: ${filePath}`);

    return { success: true, message: 'Document deleted successfully' };
  } catch (error) {
    logger.error('Error deleting document from GCS:', error);
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
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

export const fileProcessor = {
  extractTextFromFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  cleanupFile,
  uploadToGCS,
  deleteDocumentFromGCS,
  getMimeType,
};
