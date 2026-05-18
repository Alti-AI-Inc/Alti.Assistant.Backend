import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../../../shared/logger.js';
import ApiError from '../../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { STORAGE_CONFIG } from '../translation.constant.js';

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
      'GCS credentials not configured. Translation file uploads will be stored locally only.'
    );
  }

  if (storage && bucketName) {
    bucket = storage.bucket(bucketName);
  }
} catch (error) {
  logger.error(
    'Failed to initialize Google Cloud Storage for translation:',
    error
  );
}

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

    logger.info(
      `Translation file uploaded successfully to GCS: ${destination}`
    );

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
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'GCS not configured'
      );
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
 * Clean up temporary local file
 */
const cleanupLocalFile = async (filePath) => {
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

export const gcsFileProcessor = {
  uploadToGCS,
  downloadFromGCS,
  deleteFromGCS,
  cleanupLocalFile,
  getMimeType,
};
