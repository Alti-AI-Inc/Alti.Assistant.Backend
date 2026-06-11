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
 * @param {object} actorContext - The authenticated user's context, required for security and tenancy.
 * @param {string} actorContext.userId - The ID of the user uploading the contract.
 * @param {string} actorContext.workspaceId - The ID of the user's workspace to ensure tenant isolation.
 * @param {string} actorContext.role - The role of the user (for context, though not used for authorization here).
 * @param {object} [contractMetadata={}] - Optional metadata about the contract.
 * @param {string} [contractMetadata.contractType] - The type of the contract (e.g., 'NDA', 'MSA').
 * @param {string} [contractMetadata.conversationId] - The ID of the conversation associated with this upload.
 * @returns {Promise<object>} A promise that resolves to an object containing the upload result.
 *   If successful GCS upload: { success: true, gcsPath: string, publicUrl: string, fileName: string, destination: string, storageType: 'gcs' }
 *   If GCS is not configured or fails: { success: true, localPath: string, fileName: string, storageType: 'local', error?: string }
 */
export const uploadContractToGCS = async (
  localFilePath,
  actorContext,
  contractMetadata = {}
) => {
  // BUGFIX: Enforce actor context for security and multi-tenancy.
  // The actorContext object, containing workspaceId and userId, must be provided from a trusted source (e.g., authenticated session).
  // This prevents IDOR vulnerabilities where a user could potentially specify another user's ID to upload files to their directory.
  if (!actorContext || !actorContext.userId || !actorContext.workspaceId) {
    logger.error('uploadContractToGCS called without a valid actorContext.');
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
    // HIERARCHY_INTEGRATION: Construct a multi-tenant destination path using both workspaceId and userId to ensure strict data isolation.
    const destination = `${GCS_CONFIG.FOLDER_PREFIX}${actorContext.workspaceId}/${actorContext.userId}/${fileName}`;

    logger.info(`Uploading contract to GCS: ${destination}`);

    // Upload file
    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType: getContentType(fileName),
        metadata: {
          contractType: contractMetadata.contractType || 'general',
          uploadedAt: new Date().toISOString(),
          // Use the trusted userId and workspaceId from the actorContext.
          userId: actorContext.userId,
          workspaceId: actorContext.workspaceId,
          conversationId: contractMetadata.conversationId || '',
        },
      },
    });

    // Note: This creates a publicly accessible URL. For sensitive documents, signed URLs with a short expiry are recommended.
    // This implementation assumes the bucket has appropriate permissions (e.g., not publicly readable by default).
    const publicUrl = `https://storage.googleapis.com/${GCS_CONFIG.BUCKET_NAME}/${destination}`;

    logger.info(`Contract uploaded successfully to GCS: ${destination}`);

    // INTEGRATION_NOTE: The calling service is responsible for tracking usage, checking limits, and sending notifications
    // based on the successful result of this function. This service only handles the file storage operation.
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
 * This function performs authorization checks based on user roles to support hierarchical management.
 * A user can delete their own file. An 'admin', 'manager', or 'super_admin' can delete any file within their workspace.
 *
 * @param {object} actorContext - The authenticated user's context, required for security and authorization.
 * @param {string} actorContext.userId - The ID of the user performing the action.
 * @param {string} actorContext.workspaceId - The ID of the user's workspace.
 * @param {string} actorContext.role - The role of the user (e.g., 'user', 'manager', 'admin', 'super_admin').
 * @param {string} fileName - The name of the file to delete (e.g., 'contract.pdf').
 * @param {string|null} [targetUserId=null] - The ID of the user who owns the file. If not provided, it's assumed the actor is deleting their own file.
 * @returns {Promise<{success: boolean, message: string}>} A promise that resolves to an object indicating the result of the deletion.
 */
export const deleteContractFromGCS = async (actorContext, fileName, targetUserId = null) => {
  // INTEGRATION_FIX: Enforce actorContext, including role, for all delete operations.
  // This prevents IDOR and ensures that only authorized users can perform deletion.
  if (!actorContext || !actorContext.userId || !actorContext.workspaceId || !actorContext.role) {
    logger.error('deleteContractFromGCS called without a valid actorContext.');
    return { success: false, message: 'User context (userId, workspaceId, role) is required for file deletion.' };
  }
  if (!fileName) {
    logger.error('deleteContractFromGCS called without a fileName.');
    return { success: false, message: 'File name is required for deletion.' };
  }

  const fileOwnerId = targetUserId || actorContext.userId;

  // HIERARCHY_GAP_FIX: Implement role-based authorization for deletion.
  // A user can only delete their own files. Admins, managers, and super_admins can delete files owned by other users in their workspace.
  if (fileOwnerId !== actorContext.userId) {
    if (!['admin', 'manager', 'super_admin'].includes(actorContext.role)) {
      logger.warn(`Authorization Denied: User ${actorContext.userId} (role: ${actorContext.role}) attempted to delete file '${fileName}' for user ${fileOwnerId}.`);
      return { success: false, message: 'You do not have permission to delete files for other users.' };
    }
    // A higher-level service should have already verified that targetUserId belongs to the actor's workspace.
    // This service enforces the check at the storage access layer.
    logger.info(`Privileged Deletion: User ${actorContext.userId} (role: ${actorContext.role}) is deleting file '${fileName}' for user ${fileOwnerId}.`);
  }

  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    // Construct the full, tenant-isolated path using the file owner's ID and the actor's workspace.
    // This ensures an admin from workspace A cannot delete a file in workspace B.
    // Use path.basename on the incoming fileName as an extra precaution against path traversal.
    const safeFileName = path.basename(fileName);
    const filePath = `${GCS_CONFIG.FOLDER_PREFIX}${actorContext.workspaceId}/${fileOwnerId}/${safeFileName}`;

    await bucket.file(filePath).delete();

    logger.info(`Contract deleted from GCS: ${filePath}`);

    return { success: true, message: 'Contract deleted successfully' };
  } catch (error) {
    // GCS throws an error if the file doesn't exist, which might not be a critical failure.
    // For simplicity and to report other potential errors (like permissions), we'll report failure.
    logger.error(`Error deleting contract from GCS (${actorContext.workspaceId}/${fileOwnerId}/${fileName}):`, error);
    return { success: false, message: `Failed to delete file from storage: ${error.message}` };
  }
};