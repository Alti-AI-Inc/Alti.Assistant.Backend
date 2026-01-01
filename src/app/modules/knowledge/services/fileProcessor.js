import fs from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';
import { STORAGE_CONFIG, KNOWLEDGE_CONFIG } from '../knowledge.constant.js';

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: config.google?.gcp_project_id,
  keyFilename: 'alti_gcp.json',
});

/**
 * Extract text from PDF
 */
const extractTextFromPDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = new PDFParse({
      data: dataBuffer,
    })
    const textData = await data.getText()
    return textData.pages.map(page => page.text).join('\n');
  } catch (error) {
    logger.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extract text from DOCX
 */
const extractTextFromDOCX = async (filePath) => {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    logger.error('Error extracting text from DOCX:', error);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
};

/**
 * Extract text from TXT
 */
const extractTextFromTXT = async (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    logger.error('Error reading text file:', error);
    throw new Error(`Failed to read text file: ${error.message}`);
  }
};

/**
 * Extract text from file based on type
 */
export const extractTextFromFile = async (fileInfo) => {
  try {
    const filePath = fileInfo.path || fileInfo.location;
    const ext = path.extname(fileInfo.originalName || fileInfo.filename).toLowerCase();

    logger.info(`Extracting text from file: ${fileInfo.originalName}, type: ${ext}`);

    let text = '';

    switch (ext) {
      case '.pdf':
        text = await extractTextFromPDF(filePath);
        break;
      case '.docx':
        text = await extractTextFromDOCX(filePath);
        break;
      case '.doc':
        text = await extractTextFromDOCX(filePath);
        break;
      case '.txt':
      case '.md':
      case '.csv':
      case '.json':
      case '.xml':
      case '.html':
        text = await extractTextFromTXT(filePath);
        break;
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }

    if (!text || text.trim().length === 0) {
      throw new Error('No text could be extracted from the file');
    }

    logger.info(`Successfully extracted ${text.length} characters from file`);
    return text;
  } catch (error) {
    logger.error('Error in extractTextFromFile:', error);
    throw error;
  }
};

/**
 * Upload file to Google Cloud Storage
 * @param {Buffer|string} fileData - Buffer or file path
 * @param {string} fileName - Name for the file in GCS
 * @param {object} metadata - File metadata
 */
export const uploadToGCS = async (fileData, fileName, metadata = {}) => {
  try {
    const bucket = storage.bucket(STORAGE_CONFIG.GCS_BUCKET);
    const gcsPath = `${metadata.ownerType === 'user' ? STORAGE_CONFIG.USER_FILES_PREFIX : STORAGE_CONFIG.BOT_FILES_PREFIX}/${metadata.ownerId}${metadata.folderId ? `/folders/${metadata.folderId}` : ''}/${fileName}`;

    logger.info(`Uploading file to GCS: ${gcsPath}`);

    const file = bucket.file(gcsPath);

    // Determine content type
    const ext = path.extname(fileName).toLowerCase();
    const contentTypeMap = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.md': 'text/markdown',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Get file data - support both Buffer and file path
    let fileBuffer;
    if (Buffer.isBuffer(fileData)) {
      fileBuffer = fileData;
    } else if (typeof fileData === 'string') {
      fileBuffer = fs.readFileSync(fileData);
    } else {
      throw new Error('Invalid file data: must be Buffer or file path string');
    }

    // Upload file
    await file.save(fileBuffer, {
      metadata: {
        contentType: contentType,
        metadata: {
          ...metadata,
          uploadedAt: new Date().toISOString(),
        },
      },
      resumable: false,
    });

    const publicUrl = `https://storage.googleapis.com/${STORAGE_CONFIG.GCS_BUCKET}/${gcsPath}`;

    logger.info(`File uploaded successfully to GCS: ${publicUrl}`);

    return {
      publicUrl,
      gcsPath,
      bucket: STORAGE_CONFIG.GCS_BUCKET,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error uploading to GCS:', error);
    throw new Error(`Failed to upload to GCS: ${error.message}`);
  }
};

/**
 * Delete temporary local file
 */
export const cleanupTempFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Cleaned up temp file: ${filePath}`);
    }
  } catch (error) {
    logger.warn(`Failed to cleanup temp file: ${filePath}`, error);
  }
};

/**
 * Delete file from GCS
 */
export const deleteFromGCS = async (gcsPath) => {
  try {
    const bucket = storage.bucket(STORAGE_CONFIG.GCS_BUCKET);
    const file = bucket.file(gcsPath);
    await file.delete();
    logger.info(`Deleted file from GCS: ${gcsPath}`);
    return true;
  } catch (error) {
    logger.error('Error deleting from GCS:', error);
    return false;
  }
};

export const fileProcessor = {
  extractTextFromFile,
  uploadToGCS,
  cleanupTempFile,
  deleteFromGCS,
};
