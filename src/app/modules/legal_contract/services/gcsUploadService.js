import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../../shared/logger.js';

// GCS Configuration for Legal Contracts
const GCS_CONFIG = {
  BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'alti_assistant_documents',
  PROJECT_ID: process.env.GCP_PROJECT_ID,
  KEY_FILE: process.env.GCS_KEY_FILE,
  FOLDER_PREFIX: 'contract/',
};

// Initialize Google Cloud Storage
let storage;
let bucket;

try {
  if (GCS_CONFIG.KEY_FILE && fs.existsSync(GCS_CONFIG.KEY_FILE)) {
    storage = new Storage({
      keyFilename: GCS_CONFIG.KEY_FILE,
      projectId: GCS_CONFIG.PROJECT_ID,
    });
  } else if (GCS_CONFIG.PROJECT_ID) {
    storage = new Storage({
      projectId: GCS_CONFIG.PROJECT_ID,
    });
  } else {
    logger.warn('GCS credentials not configured. Contract uploads will be stored locally only.');
  }

  if (storage && GCS_CONFIG.BUCKET_NAME) {
    bucket = storage.bucket(GCS_CONFIG.BUCKET_NAME);
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

/**
 * Upload contract file to Google Cloud Storage
 */
export const uploadContractToGCS = async (localFilePath, contractMetadata = {}) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Returning local file path.');
      return {
        success: true,
        localPath: localFilePath,
        fileName: path.basename(localFilePath),
        storageType: 'local',
      };
    }

    const fileName = path.basename(localFilePath);
    const destination = `${GCS_CONFIG.FOLDER_PREFIX}${contractMetadata.userId || 'anonymous'}/${fileName}`;

    logger.info(`Uploading contract to GCS: ${destination}`);

    // Upload file
    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType: getContentType(fileName),
        metadata: {
          contractType: contractMetadata.contractType || 'general',
          uploadedAt: new Date().toISOString(),
          userId: contractMetadata.userId || 'anonymous',
          conversationId: contractMetadata.conversationId || '',
        },
      },
    });


    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${GCS_CONFIG.BUCKET_NAME}/${destination}`;

    logger.info(`Contract uploaded successfully to GCS: ${destination}`);

    return {
      success: true,
      gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${destination}`,
      publicUrl,
      fileName,
      destination,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error uploading contract to GCS:', error);

    // Return local path as fallback
    return {
      success: true,
      localPath: localFilePath,
      fileName: path.basename(localFilePath),
      storageType: 'local',
      error: error.message,
    };
  }
};

/**
 * Get content type based on file extension
 */
const getContentType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Delete contract from GCS
 */
export const deleteContractFromGCS = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    // Extract file path from gs:// URL
    const filePath = gcsPath.replace(`gs://${GCS_CONFIG.BUCKET_NAME}/`, '');

    await bucket.file(filePath).delete();

    logger.info(`Contract deleted from GCS: ${filePath}`);

    return { success: true, message: 'Contract deleted successfully' };
  } catch (error) {
    logger.error('Error deleting contract from GCS:', error);
    return { success: false, message: error.message };
  }
};
