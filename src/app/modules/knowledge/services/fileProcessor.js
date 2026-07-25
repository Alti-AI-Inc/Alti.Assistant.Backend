import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';
import { STORAGE_CONFIG, KNOWLEDGE_CONFIG } from '../knowledge.constant.js';

/**
 * @typedef {object} FileInfo
 * @property {string} path - The absolute path to the file on the local filesystem (preferred).
 * @property {string} [location] - An alternative absolute path to the file on the local filesystem.
 * @property {string} originalName - The original name of the file, used to determine the file extension.
 * @property {string} [filename] - An alternative filename, used to determine the file extension.
 */

/**
 * @typedef {object} GCSUploadResult
 * @property {string} publicUrl - The publicly accessible URL of the uploaded file.
 * @property {string} gcsPath - The full path of the file within the GCS bucket.
 * @property {string} bucket - The name of the GCS bucket where the file was stored.
 * @property {string} storageType - The type of storage used, always 'gcs'.
 */

/**
 * Google Cloud Storage client instance.
 * @type {Storage}
 */
const storage = new Storage({
  projectId: config.google?.gcp_project_id,
  keyFilename: 'inso_gcp.json',
});

/**
 * Extracts text content from a PDF file.
 *
 * @async
 * @param {string} filePath - The absolute path to the PDF file on the local filesystem.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the PDF.
 * @throws {Error} If an error occurs during file reading or text extraction.
 */
const extractTextFromPDF = async (filePath) => {
  try {
    // Optimized: Use non-blocking asynchronous file reading to prevent event loop blocking
    const dataBuffer = await fs.readFile(filePath);
    const data = new PDFParse({
      data: dataBuffer,
    });
    const textData = await data.getText();
    return textData.pages.map((page) => page.text).join('\n');
  } catch (error) {
    logger.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
};

/**
 * Extracts raw text content from a DOCX file.
 *
 * @async
 * @param {string} filePath - The absolute path to the DOCX file on the local filesystem.
 * @returns {Promise<string>} A promise that resolves with the extracted raw text content of the DOCX file.
 * @throws {Error} If an error occurs during file reading or text extraction.
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
 * Reads and returns the entire text content from a plain text file (TXT, MD, CSV, JSON, XML, HTML).
 *
 * @async
 * @param {string} filePath - The absolute path to the text file on the local filesystem.
 * @returns {Promise<string>} A promise that resolves with the entire text content of the file.
 * @throws {Error} If an error occurs during file reading.
 */
const extractTextFromTXT = async (filePath) => {
  try {
    // Optimized: Use non-blocking asynchronous file reading to prevent event loop blocking
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    logger.error('Error reading text file:', error);
    throw new Error(`Failed to read text file: ${error.message}`);
  }
};

/**
 * Extracts text from a given file based on its extension.
 * Supports PDF, DOCX, DOC, TXT, MD, CSV, JSON, XML, and HTML file types.
 *
 * @async
 * @param {FileInfo} fileInfo - An object containing information about the file to be processed.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the file.
 * @throws {Error} If the file type is unsupported or if no text could be extracted from the file.
 */
export const extractTextFromFile = async (fileInfo) => {
  try {
    const filePath = fileInfo.path || fileInfo.location;
    const ext = path
      .extname(fileInfo.originalName || fileInfo.filename)
      .toLowerCase();

    logger.info(
      `Extracting text from file: ${fileInfo.originalName}, type: ${ext}`
    );

    let text = '';

    switch (ext) {
      case '.pdf':
        text = await extractTextFromPDF(filePath);
        break;
      case '.docx':
      case '.doc': // mammoth can handle .doc files to some extent, but .docx is preferred.
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
 * Securely uploads a file to a tenant-isolated path in Google Cloud Storage (GCS).
 * The file can be provided as a Buffer or a local file path.
 * The GCS path is constructed to enforce data isolation between workspaces.
 *
 * @async
 * @param {Buffer|string} fileData - The file content as a Buffer or the absolute path to the local file.
 * @param {string} fileName - The desired name for the file in Google Cloud Storage, including its extension. Any path information is stripped.
 * @param {object} metadata - Metadata for constructing the secure GCS path.
 * @param {string} metadata.workspaceId - The ID of the workspace (tenant) to which this file belongs. CRITICAL for data isolation.
 * @param {string} metadata.ownerType - The type of owner (e.g., 'user', 'bot') to determine the GCS path prefix.
 * @param {string} metadata.ownerId - The ID of the owner, used to create a unique folder structure within the workspace.
 * @param {string} [metadata.folderId] - Optional ID of a specific folder within the owner's directory.
 * @returns {Promise<GCSUploadResult>} A promise that resolves with an object containing the public URL, GCS path, bucket name, and storage type.
 * @throws {Error} If metadata is invalid, a path traversal attempt is detected, file data is invalid, or the upload to GCS fails.
 */
export const uploadToGCS = async (fileData, fileName, metadata) => {
  try {
    // SECURITY & INTEGRATION FIX: Enforce tenant boundaries and prevent path traversal.
    // The GCS path must be constructed from validated and sanitized components to ensure
    // files are stored within the correct workspace and user directory, preventing IDOR and data leakage.
    if (!metadata || !metadata.workspaceId || !metadata.ownerId || !metadata.ownerType) {
      throw new Error('workspaceId, ownerId, and ownerType are required in metadata for GCS upload.');
    }

    const validatePathComponent = (component, componentName) => {
      if (typeof component !== 'string' || component.includes('..') || component.includes('/')) {
        // Log the attempt for security monitoring.
        logger.warn(`Potential path traversal attempt detected. Component '${componentName}' with value '${component}' is invalid.`);
        throw new Error(`Invalid format for ${componentName}.`);
      }
      return component;
    };

    // SECURITY FIX: Sanitize filename to remove any directory paths, preventing path traversal.
    const safeFileName = path.basename(fileName);

    // SECURITY FIX: Validate other path components to prevent path traversal.
    const workspaceId = validatePathComponent(metadata.workspaceId, 'workspaceId');
    const ownerId = validatePathComponent(metadata.ownerId, 'ownerId');
    const folderId = metadata.folderId ? validatePathComponent(metadata.folderId, 'folderId') : null;

    const bucket = storage.bucket(STORAGE_CONFIG.GCS_BUCKET);
    
    // INTEGRATION FIX: Construct a secure, tenant-isolated path using the workspaceId.
    const ownerPrefix = metadata.ownerType === 'user' ? STORAGE_CONFIG.USER_FILES_PREFIX : STORAGE_CONFIG.BOT_FILES_PREFIX;
    const folderPath = folderId ? `/folders/${folderId}` : '';
    const gcsPath = `workspaces/${workspaceId}/${ownerPrefix}/${ownerId}${folderPath}/${safeFileName}`;

    logger.info(`Uploading file to GCS: ${gcsPath}`);

    const file = bucket.file(gcsPath);

    // Determine content type
    const ext = path.extname(safeFileName).toLowerCase();
    const contentTypeMap = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.md': 'text/markdown',
      '.xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    // Get file data - support both Buffer and file path
    let fileBuffer;
    if (Buffer.isBuffer(fileData)) {
      fileBuffer = fileData;
    } else if (typeof fileData === 'string') {
      // Optimized: Use non-blocking asynchronous file reading to prevent event loop blocking
      fileBuffer = await fs.readFile(fileData);
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
 * Deletes a temporary local file from the filesystem.
 * Logs a warning if the cleanup fails but does not throw an error to avoid disrupting main flow.
 *
 * @async
 * @param {string} filePath - The absolute path to the temporary file to be deleted.
 * @returns {Promise<void>} A promise that resolves when the file has been deleted or if it didn't exist.
 */
export const cleanupTempFile = async (filePath) => {
  try {
    // Optimized: Use non-blocking asynchronous unlink to prevent event loop blocking.
    // Directly attempting to delete and catching ENOENT is faster and avoids race conditions.
    await fs.unlink(filePath);
    logger.info(`Cleaned up temp file: ${filePath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(`Failed to cleanup temp file: ${filePath}`, error);
    }
  }
};

/**
 * Deletes a file from Google Cloud Storage.
 *
 * @async
 * @param {string} gcsPath - The full path of the file within the GCS bucket (e.g., 'users/userId/filename.pdf').
 * @returns {Promise<boolean>} A promise that resolves to `true` if the file was successfully deleted, `false` otherwise.
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

/**
 * A collection of file processing utilities for extracting text, uploading to GCS,
 * and managing temporary files.
 * @type {object}
 * @property {function(FileInfo): Promise<string>} extractTextFromFile - Extracts text from various file types.
 * @property {function(Buffer|string, string, object): Promise<GCSUploadResult>} uploadToGCS - Uploads a file to Google Cloud Storage.
 * @property {function(string): Promise<void>} cleanupTempFile - Deletes a temporary local file.
 * @property {function(string): Promise<boolean>} deleteFromGCS - Deletes a file from Google Cloud Storage.
 */
export const fileProcessor = {
  extractTextFromFile,
  uploadToGCS,
  cleanupTempFile,
  deleteFromGCS,
};