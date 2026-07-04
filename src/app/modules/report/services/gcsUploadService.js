/**
 * @file gcsUploadService.js
 * @description Service for handling file uploads, downloads, and management with Google Cloud Storage (GCS).
 * This file also includes the main Express server setup for Cloud Run compatibility,
 * including health checks and graceful shutdown procedures.
 * @module services/gcsUploadService
 */
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import config from '../../../../../config/index.js';
import { redisClient } from '../../../../shared/redis.js'; // Assumes a configured Redis client is exported
import { logger } from '../../../../shared/logger.js';

// --- Rate Limiting & DDOS Protection Setup ---

/**
 * Custom error class for rate limit rejections.
 * This allows upstream error handlers to specifically catch and handle 429 Too Many Requests responses.
 */
class RateLimitError extends Error {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Centralized Redis-based rate limiters to protect GCS operations from abuse and excessive cost.
 * These are applied at the service layer, keyed by userId, to ensure consistent
 * protection regardless of how the service function is called.
 */

// Limiter for generating signed URLs (read/write).
// Allows a burst of requests but prevents sustained abuse from a single user.
const signedUrlLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_gcs_signed_url',
  points: 30, // 30 requests
  duration: 60, // per 60 seconds (1 minute)
  blockDuration: 60 * 5, // Block for 5 minutes if limit is exceeded
});

// Stricter limiter for destructive operations like deletion.
const deleteLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_gcs_delete',
  points: 10, // 10 requests
  duration: 60, // per 60 seconds (1 minute)
  blockDuration: 60 * 10, // Block for 10 minutes
});

// Limiter for file uploads, which are resource-intensive.
const uploadLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_gcs_upload',
  points: 20, // 20 uploads
  duration: 60 * 5, // per 5 minutes
  blockDuration: 60 * 15, // Block for 15 minutes
});

// Limiter for metadata operations like checking file existence.
const metadataLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_gcs_metadata',
  points: 60, // 60 requests
  duration: 60, // per 60 seconds (1 minute)
  blockDuration: 60 * 1, // Block for 1 minute
});

/**
 * Consumes a point from a given rate limiter for a specific key.
 * Throws a RateLimitError if the consumption is rejected.
 * @param {import('rate-limiter-flexible').RateLimiterRedis} limiter - The rate limiter instance.
 * @param {string} key - The key to rate limit against (e.g., userId).
 * @throws {RateLimitError} If the rate limit is exceeded.
 */
const handleRateLimit = async (limiter, key) => {
  try {
    await limiter.consume(key);
  } catch (rejRes) {
    logger.warn(
      `Rate limit exceeded for key "${key}" on limiter "${limiter.keyPrefix}"`
    );
    throw new RateLimitError();
  }
};

/**
 * Extracts the userId from a GCS path string (e.g., "userId/conversationId/file.pdf").
 * @param {string} gcsPath - The GCS file path.
 * @returns {string|null} The extracted userId or null if the path is invalid.
 */
const getUserIdFromGCSPath = (gcsPath) => {
  if (!gcsPath || typeof gcsPath !== 'string') return null;
  const parts = gcsPath.split('/');
  return parts.length > 0 ? parts[0] : null;
};

// --- End of Rate Limiting Setup ---

/**
 * Google Cloud Storage client instance.
 * Initialized with project ID and key file from configuration.
 * @type {import('@google-cloud/storage').Storage}
 */
const storage = new Storage({
  projectId: config.google.gcp_project_id,
  keyFilename: 'insoai_gcp.json',
});

/**
 * The name of the GCS bucket used for storing report files.
 * @type {string}
 * @constant
 */
const REPORT_BUCKET = 'insoai_assistant_reports';

/**
 * Determines the appropriate MIME content type for a file based on its extension.
 * Defaults to 'application/octet-stream' if the extension is not recognized.
 * @param {string} filePath - The full file name or path (e.g., 'report.pdf').
 * @returns {string} The corresponding content type string.
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
 * The file path in GCS is structured as `userId/conversationId/fileName` to provide multi-tenant separation.
 * @param {Buffer} fileBuffer - The file content as a buffer.
 * @param {string} fileName - Name for the file in GCS.
 * @param {string} userId - User ID for organizing files, creating a tenant-specific path.
 * @param {string} conversationId - Conversation ID for organizing files within a user's scope.
 * @returns {Promise<Object>} - An object containing the upload result with GCS path information.
 * @throws {Error|RateLimitError} If the file buffer is empty, if the upload fails, or if the rate limit is exceeded.
 */
export const uploadReportToGCS = async (
  fileBuffer,
  fileName,
  userId,
  conversationId
) => {
  // Apply rate limit before proceeding.
  await handleRateLimit(uploadLimiter, userId);

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
    // RateLimitError is thrown by handleRateLimit and will propagate up.
    // This block handles GCS-specific errors.
    logger.error('Error uploading report to GCS:', error);
    throw new Error(`Failed to upload report to GCS: ${error.message}`);
  }
};

/**
 * Get a writable stream to upload a report to GCS.
 * This allows for streaming large files without buffering them entirely in memory.
 * The caller is responsible for piping a readable stream to the returned writable stream
 * and handling 'error' and 'finish' events.
 * The file path in GCS is structured as `userId/conversationId/fileName`.
 * @param {string} fileName - Name for the file in GCS.
 * @param {string} userId - User ID for organizing files, creating a tenant-specific path.
 * @param {string} conversationId - Conversation ID for organizing files within a user's scope.
 * @returns {Promise<{stream: import('stream').Writable, gcsPath: string}>} - An object containing the GCS Writable stream and the file's GCS path.
 * @throws {RateLimitError} If the rate limit is exceeded.
 */
export const getGCSReportUploadStream = async (
  fileName,
  userId,
  conversationId
) => {
  // Apply rate limit before creating the stream.
  await handleRateLimit(uploadLimiter, userId);

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
 * The file path in GCS is structured as `userId/conversationId/fileName`.
 * @param {string} fileName - The name the file will have in GCS.
 * @param {string} contentType - The MIME type of the file being uploaded (e.g., 'application/pdf').
 * @param {string} userId - User ID for organizing files, creating a tenant-specific path.
 * @param {string} conversationId - Conversation ID for organizing files within a user's scope.
 * @returns {Promise<{url: string, gcsPath: string}>} - The signed URL for PUT requests and the GCS path.
 * @throws {Error|RateLimitError} If URL generation fails or rate limit is exceeded.
 */
export const generateV4UploadSignedUrl = async (
  fileName,
  contentType,
  userId,
  conversationId
) => {
  // Apply rate limit before generating the URL.
  await handleRateLimit(signedUrlLimiter, userId);

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
 * Access control (e.g., ensuring the requesting user owns the file) should be handled by the calling service
 * before invoking this function.
 * @param {string} gcsPath - Path of the file in GCS (e.g., 'userId/conversationId/fileName.pdf').
 * @returns {Promise<string>} - The signed URL for GET requests.
 * @throws {Error|RateLimitError} If URL generation fails, path is invalid, or rate limit is exceeded.
 */
export const getGCSReportSignedUrl = async (gcsPath) => {
  const userId = getUserIdFromGCSPath(gcsPath);
  if (!userId) {
    throw new Error('Invalid GCS path format; cannot determine user for rate limiting.');
  }
  // Apply rate limit before generating the URL.
  await handleRateLimit(signedUrlLimiter, userId);

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
 * Deletes a report file from GCS.
 * Access control should be handled by the calling service.
 * @param {string} gcsPath - Path of the file in GCS to be deleted.
 * @returns {Promise<boolean>} - True if deletion was successful, false otherwise.
 * @throws {Error|RateLimitError} If path is invalid or rate limit is exceeded.
 */
export const deleteReportFromGCS = async (gcsPath) => {
  const userId = getUserIdFromGCSPath(gcsPath);
  if (!userId) {
    throw new Error('Invalid GCS path format; cannot determine user for rate limiting.');
  }
  // Apply a stricter rate limit for destructive actions.
  await handleRateLimit(deleteLimiter, userId);

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
 * Checks if a file exists in GCS at the specified path.
 * @param {string} gcsPath - Path of the file in GCS.
 * @returns {Promise<boolean>} - True if the file exists, false otherwise.
 * @throws {Error|RateLimitError} If path is invalid or rate limit is exceeded.
 */
export const checkReportExistsInGCS = async (gcsPath) => {
  const userId = getUserIdFromGCSPath(gcsPath);
  if (!userId) {
    throw new Error('Invalid GCS path format; cannot determine user for rate limiting.');
  }
  // Apply rate limit for metadata operations.
  await handleRateLimit(metadataLimiter, userId);

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