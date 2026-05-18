import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { GCS_CONFIG } from '../document.constant.js';

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
    logger.warn(
      'GCS credentials not configured. Document uploads will be stored locally only.'
    );
  }

  if (storage && GCS_CONFIG.BUCKET_NAME) {
    bucket = storage.bucket(GCS_CONFIG.BUCKET_NAME);
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

/**
 * Upload document file to Google Cloud Storage
 */
export const uploadDocumentToGCS = async (
  localFilePath,
  documentMetadata = {}
) => {
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
    const destination = `${GCS_CONFIG.FOLDER_PREFIX}${documentMetadata.userId || 'anonymous'}/${fileName}`;

    logger.info(`Uploading document to GCS: ${destination}`);

    // Upload file
    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType: getContentType(fileName),
        metadata: {
          documentType: documentMetadata.documentType || 'general',
          uploadedAt: new Date().toISOString(),
          userId: documentMetadata.userId || 'anonymous',
          title: documentMetadata.title || 'Untitled',
        },
      },
    });

    // Make file publicly accessible (optional - configure based on your needs)
    const file = bucket.file(destination);

    // Generate signed URL (valid for 7 days)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info(`Document uploaded successfully to GCS: ${destination}`);

    return {
      success: true,
      gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${destination}`,
      publicUrl: signedUrl,
      fileName,
      destination,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error uploading document to GCS:', error);

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
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.md': 'text/markdown',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Delete document from GCS
 */
export const deleteDocumentFromGCS = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    // Extract file path from gs:// URL
    const filePath = gcsPath.replace(`gs://${GCS_CONFIG.BUCKET_NAME}/`, '');

    await bucket.file(filePath).delete();

    logger.info(`Document deleted from GCS: ${filePath}`);

    return { success: true, message: 'Document deleted successfully' };
  } catch (error) {
    logger.error('Error deleting document from GCS:', error);
    return { success: false, message: error.message };
  }
};
