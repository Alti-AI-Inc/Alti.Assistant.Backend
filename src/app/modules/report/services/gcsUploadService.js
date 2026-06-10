import { Storage } from '@google-cloud/storage';
import path from 'path';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

const storage = new Storage({
  projectId: config.google.gcp_project_id,
  keyFilename: 'alti_gcp.json',
});

const REPORT_BUCKET = 'alti_assistant_reports';

/**
 * Get content type based on file extension
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
 * @param {Buffer} fileBuffer - The file content as a buffer.
 * @param {string} fileName - Name for the file in GCS.
 * @param {string} userId - User ID for organizing files.
 * @param {string} conversationId - Conversation ID for organizing files.
 * @returns {Promise<Object>} - Upload result with GCS path information.
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
 * @param {string} fileName - Name for the file in GCS.
 * @param {string} userId - User ID for organizing files.
 * @param {string} conversationId - Conversation ID for organizing files.
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
 * @param {string} fileName - The name the file will have in GCS.
 * @param {string} contentType - The MIME type of the file being uploaded (e.g., 'image/jpeg').
 * @param {string} userId - User ID for organizing files.
 * @param {string} conversationId - Conversation ID for organizing files.
 * @returns {Promise<{url: string, gcsPath: string}>} - The signed URL for PUT requests and the GCS path.
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
 * @param {string} gcsPath - Path of the file in GCS.
 * @returns {Promise<string>} - The signed URL for GET requests.
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
 * Delete a report file from GCS
 * @param {string} gcsPath - Path of the file in GCS
 * @returns {Promise<boolean>} - Success status
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
 * Check if a file exists in GCS
 * @param {string} gcsPath - Path of the file in GCS
 * @returns {Promise<boolean>} - True if exists, false otherwise
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