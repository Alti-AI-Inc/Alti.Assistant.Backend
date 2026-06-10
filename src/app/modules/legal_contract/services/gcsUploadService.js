import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../../shared/logger.js';

/**
 * Configuration object for Google Cloud Storage (GCS) related to legal contracts.
 * Values are sourced from environment variables.
 * @constant
 * @type {{BUCKET_NAME: string, PROJECT_ID: string|undefined, KEY_FILE: string|undefined, FOLDER_PREFIX: string}}
 */
const GCS_CONFIG = {
  /** The name of the GCS bucket where contracts are stored. */
  BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'alti_assistant_documents',
  /** The Google Cloud Platform project ID. */
  PROJECT_ID: process.env.GCP_PROJECT_ID,
  /** The path to the GCS key file for authentication. */
  KEY_FILE: process.env.GCS_KEY_FILE,
  /** The prefix for all contract files stored in the bucket. */
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
    // Authenticates using Application Default Credentials
    storage = new Storage({
      projectId: GCS_CONFIG.PROJECT_ID,
    });
  } else {
    logger.warn(
      'GCS credentials not configured. Contract uploads will be stored locally only.'
    );
  }

  if (storage && GCS_CONFIG.BUCKET_NAME) {
    bucket = storage.bucket(GCS_CONFIG.BUCKET_NAME);
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

/**
 * Uploads a legal contract file to Google Cloud Storage.
 * If GCS is not configured or if the upload fails, it gracefully falls back
 * to returning information about the local file.
 * The file is stored in a user-specific folder within GCS to support multi-tenancy.
 *
 * @param {string} localFilePath - The local path to the file to be uploaded.
 * @param {object} [contractMetadata={}] - Optional metadata about the contract.
 * @param {string} [contractMetadata.userId] - The ID of the user uploading the contract. Used for creating a user-specific folder.
 * @param {string} [contractMetadata.contractType] - The type of the contract (e.g., 'NDA', 'MSA').
 * @param {string} [contractMetadata.conversationId] - The ID of the conversation associated with this upload.
 * @returns {Promise<object>} A promise that resolves to an object containing the upload result.
 *   If successful GCS upload: { success: true, gcsPath: string, publicUrl: string, fileName: string, destination: string, storageType: 'gcs' }
 *   If GCS is not configured or fails: { success: true, localPath: string, fileName: string, storageType: 'local', error?: string }
 */
export const uploadContractToGCS = async (
  localFilePath,
  contractMetadata = {}
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
 * Determines the MIME content type of a file based on its extension.
 * @private
 * @param {string} fileName - The name of the file (e.g., 'contract.pdf').
 * @returns {string} The corresponding MIME type, or a default 'application/octet-stream' if the extension is unknown.
 */
const getContentType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Deletes a contract file from Google Cloud Storage.
 *
 * @param {string} gcsPath - The GCS URI of the file to delete (e.g., 'gs://bucket-name/path/to/file.pdf').
 * @returns {Promise<{success: boolean, message: string}>} A promise that resolves to an object indicating the result of the deletion.
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