/**
 * @file gcsUploadService.js
 * @description Service for handling file uploads, downloads, and management with Google Cloud Storage (GCS).
 * This file also includes the main Express server setup for Cloud Run compatibility,
 * including health checks and graceful shutdown procedures.
 * @module services/gcsUploadService
 */
import { Storage } from '@google-cloud/storage';
import path from 'path';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Google Cloud Storage client instance.
 * Initialized with project ID and key file from configuration.
 * @type {import('@google-cloud/storage').Storage}
 */
const storage = new Storage({
  projectId: config.google.gcp_project_id,
  keyFilename: 'alti_gcp.json',
});

/**
 * The name of the GCS bucket used for storing report files.
 * @type {string}
 * @constant
 */
const REPORT_BUCKET = 'alti_assistant_reports';

/**
 * Determines the appropriate MIME content type for a file based on its extension.
 * Defaults to 'application/octet-stream' if the extension is not recognized.
 * @param {string} filePath - The full file name or path (e.g., 'report.pdf').
 * @returns {string} The corresponding content type string.
 */
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypeMap = {
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.json': 'application/json',
  };
  return contentTypeMap[ext] || 'application/octet-stream';
};

/**
 * Upload report file buffer to Google Cloud Storage.
 * This is suitable for files generated in memory and avoids local filesystem writes.
 * The file path in GCS is structured as `userId/conversationId/fileName` to provide multi-tenant separation.
 * @param {Buffer} fileBuffer - The file content as a buffer.
 * @param {string} fileName - Name for the file in GCS.
 * @param {string} userId - User ID for organizing files, creating a tenant-specific path.
 * @param {string} conversationId - Conversation ID for organizing files within a user's scope.
 * @returns {Promise<Object>} - An object containing the upload result with GCS path information.
 * @throws {Error} If the file buffer is empty or if the upload fails.
 */
export const uploadReportToGCS = async (
  fileBuffer,
  fileName,
  userId,
  conversationId
) => {
  try {
    logger.info(`Uploading report to GCS from buffer: ${fileName}`);
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('File buffer is empty or invalid.');
    }
    logger.info(`File buffer received, size: ${fileBuffer.length}`);

    const contentType = getContentType(fileName);

    // Create organized path: userId/conversationId/fileName
    const gcsPath = `${userId}/${conversationId}/${fileName}`;

    // Upload to GCS
    const bucket = storage.bucket(REPORT_BUCKET);
    const file = bucket.file(gcsPath);

    await file.save(fileBuffer, {
      metadata: {
        contentType,
      },
      resumable: false,
    });

    logger.info(`File uploaded to GCS: ${gcsPath}`);

    // The file is kept private. Access is granted via signed URLs.
    // A public URL is not returned for security reasons.

    return {
      success: true,
      gcsPath,
      bucket: REPORT_BUCKET,
      size: fileBuffer.length,
    };
  } catch (error) {
    logger.error('Error uploading report to GCS:', error);
    throw new Error(`Failed to upload report to GCS: ${error.message}`);
  }
};

/**
 * Get a writable stream to upload a report to GCS.
 * This allows for streaming large files without buffering them entirely in memory.
 * The caller is responsible for piping a readable stream to the returned writable stream
 * and handling 'error' and 'finish' events.
 * The file path in GCS is structured as `userId/conversationId/fileName`.
 * @param {string} fileName - Name for the file in GCS.
 * @param {string} userId - User ID for organizing files, creating a tenant-specific path.
 * @param {string} conversationId - Conversation ID for organizing files within a user's scope.
 * @returns {{stream: import('stream').Writable, gcsPath: string}} - An object containing the GCS Writable stream and the file's GCS path.
 */
export const getGCSReportUploadStream = (fileName, userId, conversationId) => {
  const contentType = getContentType(fileName);
  const gcsPath = `${userId}/${conversationId}/${fileName}`;

  const bucket = storage.bucket(REPORT_BUCKET);
  const file = bucket.file(gcsPath);

  const stream = file.createWriteStream({
    metadata: {
      contentType,
    },
    resumable: false, // Set to true for large files to enable resumable uploads
  });

  stream.on('error', (err) => {
    logger.error(`Error streaming report to GCS at ${gcsPath}:`, err);
  });

  stream.on('finish', () => {
    logger.info(`Successfully streamed report to GCS at ${gcsPath}`);
  });

  return { stream, gcsPath };
};

/**
 * Generates a v4 signed URL for uploading a file directly to GCS from a client.
 * This offloads the upload traffic from the backend server.
 * The client should use this URL to make a PUT request with the file content.
 * The file path in GCS is structured as `userId/conversationId/fileName`.
 * @param {string} fileName - The name the file will have in GCS.
 * @param {string} contentType - The MIME type of the file being uploaded (e.g., 'application/pdf').
 * @param {string} userId - User ID for organizing files, creating a tenant-specific path.
 * @param {string} conversationId - Conversation ID for organizing files within a user's scope.
 * @returns {Promise<{url: string, gcsPath: string}>} - The signed URL for PUT requests and the GCS path.
 * @throws {Error} If URL generation fails.
 */
export const generateV4UploadSignedUrl = async (
  fileName,
  contentType,
  userId,
  conversationId
) => {
  try {
    const gcsPath = `${userId}/${conversationId}/${fileName}`;

    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType,
    };

    const [url] = await storage
      .bucket(REPORT_BUCKET)
      .file(gcsPath)
      .getSignedUrl(options);

    logger.info(`Generated v4 signed URL for uploading to ${gcsPath}`);
    return { url, gcsPath };
  } catch (error) {
    logger.error(`Error generating v4 upload signed URL for ${fileName}:`, error);
    throw new Error(`Failed to generate upload signed URL: ${error.message}`);
  }
};

/**
 * Generates a signed URL for securely downloading a report from GCS.
 * This provides temporary, secure access to a private GCS object.
 * Access control (e.g., ensuring the requesting user owns the file) should be handled by the calling service
 * before invoking this function.
 * @param {string} gcsPath - Path of the file in GCS (e.g., 'userId/conversationId/fileName.pdf').
 * @returns {Promise<string>} - The signed URL for GET requests.
 * @throws {Error} If URL generation fails.
 */
export const getGCSReportSignedUrl = async (gcsPath) => {
  try {
    const options = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    };

    const [url] = await storage
      .bucket(REPORT_BUCKET)
      .file(gcsPath)
      .getSignedUrl(options);

    logger.info(`Generated signed URL for ${gcsPath}`);
    return url;
  } catch (error) {
    logger.error(`Error generating signed URL for ${gcsPath}:`, error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * Deletes a report file from GCS.
 * Access control should be handled by the calling service.
 * @param {string} gcsPath - Path of the file in GCS to be deleted.
 * @returns {Promise<boolean>} - True if deletion was successful, false otherwise.
 */
export const deleteReportFromGCS = async (gcsPath) => {
  try {
    const bucket = storage.bucket(REPORT_BUCKET);
    const file = bucket.file(gcsPath);
    await file.delete();
    logger.info(`Deleted report from GCS: ${gcsPath}`);
    return true;
  } catch (error) {
    logger.error('Error deleting report from GCS:', error);
    return false;
  }
};

/**
 * Checks if a file exists in GCS at the specified path.
 * @param {string} gcsPath - Path of the file in GCS.
 * @returns {Promise<boolean>} - True if the file exists, false otherwise.
 */
export const checkReportExistsInGCS = async (gcsPath) => {
  try {
    const bucket = storage.bucket(REPORT_BUCKET);
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    logger.error('Error checking report existence in GCS:', error);
    return false;
  }
};

/