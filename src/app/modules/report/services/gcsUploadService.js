import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
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
 * Upload report file to Google Cloud Storage
 * @param {string} localFilePath - Local path of the generated report
 * @param {string} fileName - Name for the file in GCS
 * @param {string} userId - User ID for organizing files
 * @param {string} conversationId - Conversation ID for organizing files
 * @returns {Promise<Object>} - Upload result with public URL
 */
export const uploadReportToGCS = async (
  localFilePath,
  fileName,
  userId,
  conversationId
) => {
  try {
    logger.info(`Uploading report to GCS: ${fileName}`);

    // Read file from local file system
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(__dirname, '../../../../../');

    // Handle paths - ensure we have absolute path
    let filePath;
    if (path.isAbsolute(localFilePath)) {
      filePath = localFilePath;
    } else {
      // Remove leading slash if present
      const relativePath = localFilePath.startsWith('/')
        ? localFilePath.substring(1)
        : localFilePath;
      filePath = path.join(projectRoot, relativePath);
    }

    logger.info(`Reading report from: ${filePath}`);
    const fileBuffer = await fs.readFile(filePath);
    logger.info(`File read successfully, size: ${fileBuffer.length}`);

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

    // Make file public
    // await file.makePublic();
    logger.info(`File made public: ${gcsPath}`);

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${REPORT_BUCKET}/${gcsPath}`;

    return {
      success: true,
      publicUrl,
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
