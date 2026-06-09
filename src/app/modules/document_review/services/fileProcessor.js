/**
 * @file This file provides a set of utility functions for processing files,
 * including text extraction from various document types (PDF, DOCX, TXT)
 * and integration with Google Cloud Storage for file uploads and deletions.
 * It handles initialization of GCS based on environment variables and
 * provides fallback mechanisms for local storage if GCS is not configured.
 */

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

/**
 * Google Cloud Storage client instance.
 * @type {Storage | undefined}
 */
let storage;
/**
 * Google Cloud Storage bucket instance.
 * @type {import('@google-cloud/storage').Bucket | undefined}
 */
let bucket;

/**
 * Initializes the Google Cloud Storage client and bucket based on environment variables.
 * If GCS credentials are not found, a warning is logged, and document uploads will
 * default to local storage.
 */
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
 * Extracts text content from a PDF file.
 * @async
 * @param {string} filePath - The absolute path to the PDF file.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the PDF.
 * @throws {ApiError} If there's an error reading the file or extracting text, with status BAD_REQUEST.
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
 * Extracts text content from a DOCX file.
 * @async
 * @param {string} filePath - The absolute path to the DOCX file.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the DOCX file.
 * @throws {ApiError} If there's an error reading the file or extracting text, with status BAD_REQUEST.
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
 * Extracts text content from a plain text file.
 * @async
 * @param {string} filePath - The absolute path to the TXT file.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the TXT file.
 * @throws {ApiError} If there's an error reading the file, with status BAD_REQUEST.
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
 * Main function to extract text from any supported file type (PDF, DOCX, TXT).
 * It determines the file type based on the original file name's extension.
 * @async
 * @param {object} fileInfo - An object containing information about the file.
 * @param {string} fileInfo.path - The absolute path to the temporary file.
 * @param {string} fileInfo.originalName - The original name of the file, used to determine the file type.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {ApiError} If the file type is unsupported or if any extraction fails, with status BAD_REQUEST.
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
 * Cleans up a temporary file by deleting it from the file system.
 * Logs a warning if the file deletion fails.
 * @async
 * @param {string} filePath - The absolute path to the file to be deleted.
 * @returns {Promise<void>} A promise that resolves when the file has been deleted or if deletion fails (logs a warning).
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
 * Uploads a file to Google Cloud Storage and returns a signed URL for access.
 * If GCS is not configured or the upload fails, it falls back to returning
 * the local file path and details, indicating local storage.
 * @async
 * @param {string} localFilePath - The absolute path to the local file to upload.
 * @param {string} filename - The desired filename for the uploaded file in GCS.
 * @param {object} [documentMetadata={}] - Optional metadata to associate with the document in GCS.
 * @param {string} [documentMetadata.userId='anonymous'] - The ID of the user uploading the document.
 * @param {string} [documentMetadata.documentType='review'] - The type of document (e.g., 'review', 'template').
 * @param {string} [documentMetadata.originalName] - The original name of the file before any renaming.
 * @returns {Promise<object>} A promise that resolves with an object containing upload details.
 * @property {boolean} success - Indicates if the upload operation was successful (true even for local fallback).
 * @property {string} [gcsPath] - The Google Cloud Storage path (gs://...) if uploaded to GCS.
 * @property {string} [publicUrl] - A signed URL for public access if uploaded to GCS.
 * @property {string} [localPath] - The local file path if GCS is not configured or upload fails.
 * @property {string} fileName - The name of the file.
 * @property {string} [destination] - The full destination path within the GCS bucket if uploaded to GCS.
 * @property {string} storageType - 'gcs' if uploaded to GCS, 'local' otherwise.
 * @property {string} [error] - Error message if GCS upload failed and fallback to local path occurred.
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
 * Deletes a document from Google Cloud Storage.
 * @async
 * @param {string} gcsPath - The Google Cloud Storage path (e.g., gs://your-bucket/path/to/file) of the document to delete.
 * @returns {Promise<object>} A promise that resolves with an object indicating success or failure.
 * @property {boolean} success - True if deletion was successful, false otherwise.
 * @property {string} message - A message describing the outcome of the operation.
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
 * Determines the MIME type of a file based on its extension.
 * @param {string} filename - The name of the file, including its extension.
 * @returns {string} The MIME type corresponding to the file extension, or 'application/octet-stream' if unknown.
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

/**
 * @typedef {object} FileProcessorService
 * @property {function(object): Promise<string>} extractTextFromFile - Extracts text from various file types (PDF, DOCX, TXT).
 * @property {function(string): Promise<string>} extractTextFromPDF - Extracts text from a PDF file.
 * @property {function(string): Promise<string>} extractTextFromDOCX - Extracts text from a DOCX file.
 * @property {function(string): Promise<string>} extractTextFromTXT - Extracts text from a TXT file.
 * @property {function(string): Promise<void>} cleanupFile - Deletes a temporary file from the file system.
 * @property {function(string, string, object): Promise<object>} uploadToGCS - Uploads a file to Google Cloud Storage or returns local path as fallback.
 * @property {function(string): Promise<object>} deleteDocumentFromGCS - Deletes a document from Google Cloud Storage.
 * @property {function(string): string} getMimeType - Determines the MIME type of a file based on its extension.
 */

/**
 * An object containing all file processing utility functions.
 * @type {FileProcessorService}
 */
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