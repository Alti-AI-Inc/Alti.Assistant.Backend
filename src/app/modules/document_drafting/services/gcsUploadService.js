import { Storage } from '@google-cloud/storage';
import path from 'path';
import { pipeline } from 'stream/promises'; // BUG FIX: Imported for robust stream handling.
import { logger } from '../../../../shared/logger.js';
import { GCS_CONFIG } from '../document.constant.js';
import SubscriptionModel from '../../subscription/subscription.model.js';
import UserUsageModel from '../../usage/userUsage.model.js';
import TenantModel from '../../tenant/tenant.model.js';
import emailService from '../../../../shared/email.service.js';
import mongoose from 'mongoose';

/**
 * Checks if the user or workspace is within the storage limit quota.
 * Sends email notifications to workspace admins if limits are reached/exceeded.
 * 
 * @param {object} user - The user context.
 */
const checkAndNotifyStorageLimit = async (user) => {
  try {
    const userId = user.id;
    const tenantId = user.tenantId;

    // 1. Fetch user's/tenant's active subscription
    const query = tenantId
      ? { tenantId, status: 'active' }
      : { userId, tenantId: null, status: 'active' };
    const subscription = await SubscriptionModel.findOne(query);

    if (!subscription) {
      return; // If no active subscription, let it fail-open or follow default limits
    }

    // Determine storage limit from subscription
    const storageLimit =
      subscription.limits?.knowledgeLimit ??
      subscription.limits?.storagePerUser ??
      0;

    if (storageLimit <= 0) return;

    // Fetch storage used in bytes
    const storageUsed = await UserUsageModel.getTotalStorage(userId, tenantId);

    // If storageUsed exceeds the limit, block the upload and notify admins
    if (storageUsed >= storageLimit) {
      // Find workspace admins/owner
      let adminEmails = [];
      if (tenantId) {
        const tenant = await TenantModel.findById(tenantId);
        if (tenant && tenant.ownerId) {
          const owner = await mongoose.model('User').findById(tenant.ownerId);
          if (owner && owner.email) {
            adminEmails.push(owner.email);
          }
        }
      } else {
        const owner = await mongoose.model('User').findById(userId);
        if (owner && owner.email) {
          adminEmails.push(owner.email);
        }
      }

      // Send storage limit alerts
      const tenantName = user.tenantName || 'Workspace';
      for (const email of adminEmails) {
        try {
          await emailService.sendStorageLimitAlert({
            to: email,
            tenantName,
            storageUsed,
            storageLimit,
          });
        } catch (err) {
          logger.error(`Failed to send storage limit alert to ${email}:`, err);
        }
      }

      throw new Error(`Storage limit reached for this workspace (${(storageUsed / (1024 * 1024)).toFixed(2)}MB / ${(storageLimit / (1024 * 1024)).toFixed(2)}MB). Upload blocked.`);
    }
  } catch (error) {
    logger.error('Error in checkAndNotifyStorageLimit:', error);
    throw error;
  }
};


// Initialize Google Cloud Storage
let storage;
let bucket;

try {
  // In a stateless container environment, authentication is best handled via
  // the environment's attached service account. The client library automatically
  // detects these credentials. We avoid referencing local key files.
  if (GCS_CONFIG.PROJECT_ID) {
    storage = new Storage({
      projectId: GCS_CONFIG.PROJECT_ID,
    });
  } else {
    logger.warn(
      'GCS_PROJECT_ID not configured. GCS services will be unavailable.'
    );
  }

  if (storage && GCS_CONFIG.BUCKET_NAME) {
    bucket = storage.bucket(GCS_CONFIG.BUCKET_NAME || 'development-fallback-bucket');
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

/**
 * Generates a v4 signed URL for uploading a file directly from the client.
 * This is the recommended approach for stateless services, as the backend
 * only brokers the transaction and never handles the file content itself.
 * @param {string} fileName - The name of the file to be uploaded.
 * @param {string} contentType - The MIME type of the file (e.g., 'application/pdf').
 * @param {object} documentMetadata - Metadata like documentType, title, etc.
 * @param {object} user - The authenticated user object from the request context.
 * @returns {Promise<object>} An object containing the signed URL and the destination path.
 */
export const generateV4UploadSignedUrl = async (
  fileName,
  contentType,
  documentMetadata = {},
  user // The authenticated user object from the request context
) => {
  if (!storage || !bucket) {
    const errorMsg = 'GCS not configured. Cannot generate signed URL.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  // SECURITY & HIERARCHY: Validate user context to ensure all actions are authorized and scoped.
  if (!user || !user.id || !user.workspaceId || !user.tenantId) {
    logger.warn('generateV4UploadSignedUrl called without a valid user context.');
    throw new Error('User context is required for this operation.');
  }

  // INTEGRATION: Verify storage limits before generating the signed upload URL.
  await checkAndNotifyStorageLimit(user);

  // SECURITY: Sanitize filename to prevent path traversal attacks (e.g., '.._.._file.txt').
  const safeFileName = path.basename(fileName);

  // HIERARCHY: Enforce tenant and workspace isolation in the storage path.
  // This structure is critical for data segregation in a multi-tenant environment.
  const destination = `${GCS_CONFIG.FOLDER_PREFIX}${user.tenantId}/${user.workspaceId}/${user.id}/${Date.now()}-${safeFileName}`;

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: contentType,
    extensionHeaders: {
      // HIERARCHY: Custom metadata must be prefixed with 'x-goog-meta-'.
      // We use the trusted user context, not user-provided metadata, for ownership details.
      'x-goog-meta-documenttype': documentMetadata.documentType || 'general',
      'x-goog-meta-uploadedat': new Date().toISOString(),
      'x-goog-meta-userid': user.id,
      'x-goog-meta-workspaceid': user.workspaceId,
      'x-goog-meta-tenantid': user.tenantId,
      'x-goog-meta-title': documentMetadata.title || 'Untitled',
    },
  };

  try {
    const [url] = await bucket.file(destination).getSignedUrl(options);
    logger.info(`Generated v4 signed URL for: ${destination}`);
    return {
      success: true,
      url,
      gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${destination}`,
      destination,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error generating v4 signed URL:', error);
    throw new Error('Could not generate upload URL.');
  }
};

/**
 * Uploads a file to GCS from a readable stream (e.g., from memory or another stream).
 * This avoids writing to the local filesystem, which is critical for stateless containers.
 * Use this when the backend must process or generate the file content before upload.
 * @param {ReadableStream} fileStream - The readable stream of the file content.
 * @param {string} fileName - The desired file name in the bucket.
 * @param {object} documentMetadata - Metadata like documentType, title, etc.
 * @param {object} user - The authenticated user object from the request context.
 * @returns {Promise<object>} A promise that resolves with the upload result.
 */
export const uploadDocumentStreamToGCS = async (
  fileStream,
  fileName,
  documentMetadata = {},
  user // The authenticated user object from the request context
) => {
  if (!storage || !bucket) {
    const errorMsg = 'GCS not configured. Cannot upload stream.';
    logger.warn(errorMsg);
    throw new Error(errorMsg);
  }

  // SECURITY & HIERARCHY: Validate user context.
  if (!user || !user.id || !user.workspaceId || !user.tenantId) {
    logger.warn('uploadDocumentStreamToGCS called without a valid user context.');
    throw new Error('User context is required for this operation.');
  }

  // INTEGRATION: Verify storage limits before initiating the upload stream.
  await checkAndNotifyStorageLimit(user);

  // SECURITY: Sanitize filename to prevent path traversal attacks.
  const safeFileName = path.basename(fileName);

  // HIERARCHY: Enforce tenant and workspace isolation in the storage path.
  const destination = `${GCS_CONFIG.FOLDER_PREFIX}${user.tenantId}/${user.workspaceId}/${user.id}/${safeFileName}`;
  const file = bucket.file(destination);

  const gcsStream = file.createWriteStream({
    resumable: false, // Use simple upload for streams/buffers
    metadata: {
      contentType: getContentType(safeFileName),
      // HIERARCHY: Store tenant and user context as metadata for auditing and ownership.
      metadata: {
        documentType: documentMetadata.documentType || 'general',
        uploadedAt: new Date().toISOString(),
        userId: user.id,
        workspaceId: user.workspaceId,
        tenantId: user.tenantId,
        title: documentMetadata.title || 'Untitled',
      },
    },
  });

  try {
    // BUG FIX: Use stream.pipeline for robust error handling and to avoid Promise constructor anti-pattern.
    await pipeline(fileStream, gcsStream);

    logger.info(`Stream uploaded successfully to GCS: ${destination}`);

    // Generate a signed URL for reading the newly uploaded file
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      success: true,
      gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${destination}`,
      publicUrl: signedUrl,
      fileName: safeFileName,
      destination,
      storageType: 'gcs',
    };
  } catch (err) {
    logger.error(`Error uploading stream to GCS at ${destination}:`, err);
    // Re-throw a more generic error to the caller.
    throw new Error('Failed to upload document stream.');
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
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Delete document from GCS
 * @param {string} gcsPath - The full gs:// path of the file to delete.
 * @param {object} user - The authenticated user object performing the deletion.
 */
export const deleteDocumentFromGCS = async (gcsPath, user) => {
  if (!storage || !bucket) {
    logger.warn('GCS not configured. Cannot delete from GCS.');
    throw new Error('GCS not configured.');
  }

  // SECURITY: Validate user context. This is critical to prevent unauthenticated access.
  if (!user || !user.id || !user.workspaceId || !user.tenantId || !user.role) {
    logger.warn('deleteDocumentFromGCS called without a valid user context.');
    throw new Error('User context is required for this operation.');
  }

  try {
    // Extract file path from gs:// URL
    const filePath = gcsPath.replace(`gs://${GCS_CONFIG.BUCKET_NAME}/`, '');

    // SECURITY VULNERABILITY FIX (IDOR): Authorization check.
    // Ensure the user has permission to delete this specific file by inspecting its path.
    // The path must follow the structure: {prefix}/{tenantId}/{workspaceId}/{ownerId}/{filename}
    const pathParts = filePath.replace(GCS_CONFIG.FOLDER_PREFIX, '').split('/');
    // Expected structure after split: [tenantId, workspaceId, ownerId, filename]
    if (pathParts.length < 4) {
      logger.error(
        `Attempt by user ${user.id} to delete file with invalid path structure: ${filePath}`
      );
      throw new Error('Permission denied or invalid file path.');
    }
    const [fileTenantId, fileWorkspaceId, fileOwnerId] = pathParts;

    // HIERARCHY & SECURITY: Check if the file belongs to the user's tenant and workspace.
    // This is the primary boundary for preventing cross-tenant/workspace data access.
    if (fileTenantId !== user.tenantId || fileWorkspaceId !== user.workspaceId) {
      logger.error(
        `IDOR ATTEMPT: User ${user.id} in workspace ${user.workspaceId} tried to delete file from workspace ${fileWorkspaceId}. Path: ${filePath}`
      );
      throw new Error('Permission denied.');
    }

    // HIERARCHY & SECURITY: Role-based access check within the workspace.
    // A 'user' can only delete their own files.
    // A 'manager' or 'admin' can delete any file within their workspace.
    // A 'super_admin' could have broader permissions, but that logic should be handled carefully.
    const isOwner = fileOwnerId === user.id;
    const isWorkspaceAdmin = ['admin', 'manager'].includes(user.role);

    if (!isOwner && !isWorkspaceAdmin) {
      logger.error(
        `PERMISSION DENIED: User ${user.id} (role: ${user.role}) tried to delete file owned by ${fileOwnerId}. Path: ${filePath}`
      );
      throw new Error('Permission denied. You are not the owner of this file.');
    }

    await bucket.file(filePath).delete();

    logger.info(`Document deleted from GCS by user ${user.id}: ${filePath}`);

    return { success: true, message: 'Document deleted successfully' };
  } catch (error) {
    // Avoid leaking detailed error messages.
    logger.error(`Error deleting document from GCS for path ${gcsPath}:`, error.message);
    throw new Error('Could not delete document.');
  }
};

/**
 * Uploads a local document file to Google Cloud Storage.
 * @param {string} localFilePath - The absolute path of the local file.
 * @param {object} documentMetadata - Metadata containing userId, documentType, etc.
 * @returns {Promise<object>} Upload result with GCS path and signed URL, or local path fallback.
 */
export const uploadDocumentToGCS = async (
  localFilePath,
  documentMetadata = {}
) => {
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

  try {
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

    const file = bucket.file(destination);
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
    return {
      success: true,
      localPath: localFilePath,
      fileName,
      storageType: 'local',
      error: error.message,
    };
  }
};