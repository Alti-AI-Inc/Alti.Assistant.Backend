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
 * The file is stored in a workspace- and user-specific folder within GCS to enforce multi-tenancy.
 *
 * @param {string} localFilePath - The local path to the file to be uploaded.
 * @param {object} userContext - The authenticated user's context, required for security and tenancy.
 * @param {string} userContext.userId - The ID of the user uploading the contract.
 * @param {string} userContext.workspaceId - The ID of the user's workspace to ensure tenant isolation.
 * @param {object} [contractMetadata={}] - Optional metadata about the contract.
 * @param {string} [contractMetadata.contractType] - The type of the contract (e.g., 'NDA', 'MSA').
 * @param {string} [contractMetadata.conversationId] - The ID of the conversation associated with this upload.
 * @returns {Promise<object>} A promise that resolves to an object containing the upload result.
 *   If successful GCS upload: { success: true, gcsPath: string, publicUrl: string, fileName: string, destination: string, storageType: 'gcs' }
 *   If GCS is not configured or fails: { success: true, localPath: string, fileName: string, storageType: 'local', error?: string }
 */
export const uploadContractToGCS = async (
  localFilePath,
  userContext,
  contractMetadata = {}
) => {
  // BUGFIX: Enforce user context for security and multi-tenancy.
  // The userContext object, containing workspaceId and userId, must be provided from a trusted source (e.g., authenticated session).
  // This prevents IDOR vulnerabilities where a user could potentially specify another user's ID to upload files to their directory.
  if (!userContext || !userContext.userId || !userContext.workspaceId) {
    logger.error('uploadContractToGCS called without a valid userContext.');
    // Throw an error instead of proceeding, as this is a critical security and integration failure.
    throw new Error('User context (userId, workspaceId) is required for file uploads.');
  }

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

    // SECURITY: Use path.basename to prevent path traversal attacks from the local file path.
    const fileName = path.basename(localFilePath);
    // HIERARCHY_GAP_FIX: Construct a multi-tenant destination path using both workspaceId and userId to ensure strict data isolation.
    const destination = `${GCS_CONFIG.FOLDER_PREFIX}${userContext.workspaceId}/${userContext.userId}/${fileName}`;

    logger.info(`Uploading contract to GCS: ${destination}`);

    // Upload file
    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType: getContentType(fileName),
        metadata: {
          contractType: contractMetadata.contractType || 'general',
          uploadedAt: new Date().toISOString(),
          // Use the trusted userId and workspaceId from the userContext.
          userId: userContext.userId,
          workspaceId: userContext.workspaceId,
          conversationId: contractMetadata.conversationId || '',
        },
      },
    });

    // Note: This creates a publicly accessible URL. For sensitive documents, signed URLs with a short expiry are recommended.
    // This implementation assumes the bucket has appropriate permissions (e.g., not publicly readable by default).
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
 * This function constructs the file path from trusted user context to prevent IDOR vulnerabilities.
 *
 * @param {object} userContext - The authenticated user's context, required for security and tenancy.
 * @param {string} userContext.userId - The ID of the user who owns the file.
 * @param {string} userContext.workspaceId - The ID of the user's workspace.
 * @param {string} fileName - The name of the file to delete (e.g., 'contract.pdf').
 * @returns {Promise<{success: boolean, message: string}>} A promise that resolves to an object indicating the result of the deletion.
 */
export const deleteContractFromGCS = async (userContext, fileName) => {
  // BUGFIX: Enforce user context and require a fileName instead of a full GCS path.
  // This prevents IDOR vulnerabilities where a user could craft a request to delete arbitrary files
  // by providing a path to a file outside of their own directory.
  if (!userContext || !userContext.userId || !userContext.workspaceId) {
    logger.error('deleteContractFromGCS called without a valid userContext.');
    return { success: false, message: 'User context (userId, workspaceId) is required for file deletion.' };
  }
  if (!fileName) {
    logger.error('deleteContractFromGCS called without a fileName.');
    return { success: false, message: 'File name is required for deletion.' };
  }

  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    // HIERARCHY_GAP_FIX: Construct the full, tenant-isolated path from trusted context.
    // This ensures a user can only attempt to delete files within their own designated folder.
    // Use path.basename on the incoming fileName as an extra precaution against path traversal.
    const safeFileName = path.basename(fileName);
    const filePath = `${GCS_CONFIG.FOLDER_PREFIX}${userContext.workspaceId}/${userContext.userId}/${safeFileName}`;

    await bucket.file(filePath).delete();

    logger.info(`Contract deleted from GCS: ${filePath}`);

    return { success: true, message: 'Contract deleted successfully' };
  } catch (error) {
    // GCS throws an error if the file doesn't exist, which might not be a critical failure.
    // For simplicity and to report other potential errors (like permissions), we'll report failure.
    logger.error(`Error deleting contract from GCS (${userContext.workspaceId}/${userContext.userId}/${fileName}):`, error);
    return { success: false, message: `Failed to delete file from storage: ${error.message}` };
  }
};