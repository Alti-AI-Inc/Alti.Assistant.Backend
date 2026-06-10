import { Storage } from '@google-cloud/storage';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// The client automatically authenticates using GOOGLE_APPLICATION_CREDENTIALS env variable
const storage = new Storage();

/**
 * Creates a brand new Google Cloud Storage (GCS) bucket.
 * 
 * @security Requires `storage.buckets.create` permission (typically provided by the `roles/storage.admin` role).
 * @param {string} bucketName - Name of the bucket to create. Must be globally unique across GCS.
 * @param {string} [location='us-central1'] - Geographic location of the bucket (e.g., 'us-central1', 'us', 'eu').
 * @returns {Promise<{success: boolean, bucketName: string, location: string, created: string}>} Bucket creation report containing metadata.
 * @throws {Error} If the bucket creation fails or if the bucket name is already taken.
 */
const createBucket = async (bucketName, location = 'us-central1') => {
  try {
    logger.info(`GCS API: Creating storage bucket "${bucketName}" in location "${location}"...`);

    const [bucket] = await storage.createBucket(bucketName, {
      location,
      storageClass: 'STANDARD'
    });

    return {
      success: true,
      bucketName: bucket.name,
      location: bucket.metadata.location,
      created: bucket.metadata.timeCreated
    };
  } catch (err) {
    logger.error('GCS Bucket Creation Error:', err);
    throw new Error(`GCS Bucket Creation failed: ${err.message}`);
  }
};

/**
 * Generates a secure, temporary pre-signed URL to read or write a file in GCS.
 * 
 * @security Requires the service account to have the `iam.serviceAccounts.signBlob` permission (typically via `roles/iam.serviceAccountTokenCreator` role) to sign URLs.
 * @multi-tenant Ensure the `fileName` includes a tenant-specific prefix (e.g., `tenants/{tenantId}/uploads/{fileId}`) to enforce logical multi-tenant isolation.
 * @param {string} bucketName - Name of the target GCS bucket.
 * @param {string} fileName - File path/object key inside the bucket.
 * @param {'read'|'write'} [action='read'] - The allowed action. 'read' allows downloading/viewing, 'write' allows uploading directly.
 * @param {number} [expiresMinutes=15] - Expiration duration in minutes.
 * @returns {Promise<{success: boolean, bucketName: string, fileName: string, action: 'read'|'write', url: string, expiresAt: Date}>} Pre-signed URL report.
 * @throws {Error} If validation fails (invalid action or expiration) or if GCS signed URL generation fails.
 */
const generateSignedUrl = async (bucketName, fileName, action = 'read', expiresMinutes = 15) => {
  try {
    // Validate 'action' parameter to ensure it's one of the allowed values.
    if (!['read', 'write'].includes(action)) {
      throw new Error('Invalid action specified. Must be "read" or "write".');
    }
    // Validate 'expiresMinutes' to ensure it's a positive number.
    if (typeof expiresMinutes !== 'number' || expiresMinutes <= 0) {
      throw new Error('Expires minutes must be a positive number.');
    }

    logger.info(`GCS API: Generating signed URL for file "${fileName}" inside bucket "${bucketName}" (action: ${action})...`);

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    const expiresTimestamp = Date.now() + expiresMinutes * 60 * 1000;

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action,
      expires: expiresTimestamp
    });

    return {
      success: true,
      bucketName,
      fileName,
      action,
      url,
      expiresAt: new Date(expiresTimestamp)
    };
  } catch (err) {
    logger.error('GCS Pre-Signed URL Error:', err);
    // Re-throw specific validation errors directly for clearer upstream handling.
    if (err.message.includes('Invalid action') || err.message.includes('Expires minutes')) {
      throw err;
    }
    throw new Error(`GCS Signed URL generation failed: ${err.message}`);
  }
};

/**
 * Lists metadata files inside a GCS storage bucket, optionally filtered by a prefix.
 * 
 * @security Requires `storage.objects.list` permission (typically provided by `roles/storage.objectViewer` or `roles/storage.objectAdmin` roles).
 * @multi-tenant To enforce tenant isolation, always pass the tenant's unique directory prefix (e.g., `tenants/{tenantId}/`) as the `prefix` parameter.
 * @param {string} bucketName - Name of the GCS bucket.
 * @param {string} [prefix=''] - Optional prefix directory filter (e.g., 'users/123/').
 * @returns {Promise<{success: boolean, bucketName: string, prefix: string, files: Array<{name: string, id: string, size: number, updated: string, mimeType: string}>}>} Listed files report.
 * @throws {Error} If listing files fails.
 */
const listFiles = async (bucketName, prefix = '') => {
  try {
    logger.info(`GCS API: Listing files inside bucket "${bucketName}" matching prefix "${prefix}"...`);

    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ prefix });

    const fileList = files.map(file => ({
      name: file.name,
      id: file.id,
      size: parseFloat(file.metadata.size || '0'),
      updated: file.metadata.updated,
      mimeType: file.metadata.contentType
    }));

    return {
      success: true,
      bucketName,
      prefix,
      files: fileList
    };
  } catch (err) {
    logger.error('GCS Listing Files Error:', err);
    throw new Error(`GCS File Listing failed: ${err.message}`);
  }
};

/**
 * Service for interacting with Google Cloud Storage (GCS).
 * Provides utility functions for bucket creation, generating pre-signed URLs, and listing files.
 * 
 * @requires Google Cloud SDK credentials configured via `GOOGLE_APPLICATION_CREDENTIALS` environment variable.
 * @security IAM Roles Required:
 *   - `roles/storage.admin` (for bucket creation)
 *   - `roles/storage.objectAdmin` or `roles/storage.objectViewer` (for listing and generating signed URLs)
 *   - `roles/iam.serviceAccountTokenCreator` (required on the service account itself to sign URLs)
 * @multi-tenant For multi-tenant isolation, it is recommended to use a single bucket with tenant-specific prefixes (e.g., `tenant-id/path/to/file`) rather than creating separate buckets per tenant, unless strict physical isolation is required.
 */
export const GcpStorageService = {
  createBucket,
  generateSignedUrl,
  listFiles
};