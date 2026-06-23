/**
 * @file This file provides a set of utility functions for processing files,
 * including text extraction from various document types (PDF, DOCX, TXT)
 * and integration with Google Cloud Storage for file uploads and deletions.
 * It handles initialization of GCS based on environment variables and
 * provides a stateless, stream-based approach for all file operations,
 * ensuring no files are written to the local container filesystem.
 */

import fsSync from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { logger } from '../../../../shared/logger.js';
import { RedisClient, redisClient } from '../../../../shared/redis.js';
import ApiError from '../../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { STORAGE_CONFIG } from '../document_review.constant.js';

// --- Enterprise Rate-Limiting & DDOS Guard Agent: Initialization ---

/**
 * Generic options for all Redis-based rate limiters.
 * Uses the fail-open RedisClient wrapper.
 */
const rateLimiterOptions = {
  storeClient: RedisClient,
  keyPrefix: 'rlflx', // Rate Limiter Flex
  blockDuration: 60 * 5, // Block for 5 minutes if limit is exceeded
};

/**
 * Rate limiter for CPU-intensive text extraction operations.
 * Protects against resource exhaustion attacks by limiting requests per user/IP.
 */
const textExtractionLimiter = redisClient
  ? new RateLimiterRedis({
      ...rateLimiterOptions,
      keyPrefix: 'rl_extract_text',
      points: 15, // 15 extractions
      duration: 60, // per 1 minute
    })
  : null;

/**
 * Rate limiter for generating file upload URLs to control costs and prevent storage abuse.
 * Limits are set over a longer duration to manage overall usage patterns.
 */
const fileUploadLimiter = redisClient
  ? new RateLimiterRedis({
      ...rateLimiterOptions,
      keyPrefix: 'rl_upload_url', // Changed from rl_upload_file
      points: 30, // 30 URL generations
      duration: 60 * 10, // per 10 minutes
    })
  : null;

/**
 * Rate limiter for file deletions to prevent abusive GCS API calls.
 */
const fileDeletionLimiter = redisClient
  ? new RateLimiterRedis({
      ...rateLimiterOptions,
      keyPrefix: 'rl_delete_file',
      points: 60, // 60 deletions
      duration: 60, // per 1 minute
    })
  : null;

/**
 * Helper function to consume a point from a rate limiter.
 * @async
 * @param {RateLimiterRedis | null} limiter - The rate limiter instance.
 * @param {string} key - The key to rate limit against (e.g., user ID, IP address).
 * @throws {ApiError} If the rate limit is exceeded.
 */
const handleRateLimit = async (limiter, key) => {
  if (!limiter || !redisClient || redisClient.status !== 'ready') {
    // Fail open: If Redis is not available, bypass rate limiting.
    return;
  }
  try {
    await limiter.consume(key);
  } catch (rejRes) {
    if (rejRes instanceof Error) {
      // This indicates an issue with the limiter/Redis itself, not a rate limit rejection.
      logger.error('Rate limiter failed:', rejRes);
      // Fail open to maintain service availability.
      return;
    }
    // Rate limit was exceeded.
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      `Too many requests. Please try again in ${Math.ceil(
        rejRes.msBeforeNext / 1000
      )} seconds.`
    );
  }
};

// --- End of Rate-Limiting & DDOS Guard Agent Setup ---

/**
 * Google Cloud Storage client instance.
 * @type {Storage | undefined}
 */
let storage;
/**
 * Google Cloud Storage bucket instance.
 * @type {import('@google-cloud/storage').Bucket | undefined}
 */
let bucket;

/**
 * Initializes the Google Cloud Storage client and bucket based on environment variables.
 * If GCS credentials are not found, a warning is logged, and document uploads will
 * be disabled.
 */
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
    // This assumes the environment is authenticated (e.g., running on GCP)
    storage = new Storage({
      projectId: projectId,
    });
  } else {
    logger.warn(
      'GCS credentials not configured. File operations will be disabled.'
    );
  }

  if (storage && bucketName) {
    bucket = storage.bucket(bucketName || 'development-fallback-bucket');
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

/**
 * Extracts text content from a PDF file buffer.
 * @async
 * @param {Buffer} fileBuffer - The buffer containing the PDF file data.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the PDF.
 * @throws {ApiError} If there's an error parsing the buffer, with status BAD_REQUEST.
 */
const extractTextFromPDF = async (fileBuffer) => {
  try {
    // NOTE: This assumes a custom PDFParse class or an older version API.
    // A more common pattern is `import pdf from 'pdf-parse'; const data = await pdf(fileBuffer);`
    const data = new PDFParse({
      data: fileBuffer,
    });
    const pdfContent = await data.getText();
    return pdfContent.text;
  } catch (error) {
    logger.error('Error extracting text from PDF buffer:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from PDF'
    );
  }
};

/**
 * Extracts text content from a DOCX file buffer.
 * @async
 * @param {Buffer} fileBuffer - The buffer containing the DOCX file data.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the DOCX file.
 * @throws {ApiError} If there's an error parsing the buffer, with status BAD_REQUEST.
 */
const extractTextFromDOCX = async (fileBuffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } catch (error) {
    logger.error('Error extracting text from DOCX buffer:', error);
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Failed to extract text from DOCX'
    );
  }
};

/**
 * Extracts text content from a plain text file buffer.
 * @async
 * @param {Buffer} fileBuffer - The buffer containing the TXT file data.
 * @returns {Promise<string>} A promise that resolves with the extracted text content of the TXT file.
 */
const extractTextFromTXT = async (fileBuffer) => {
  return fileBuffer.toString('utf-8');
};

/**
 * Core logic to extract text from a file stored in GCS.
 * This is the unprotected internal implementation. It downloads the file into memory
 * for processing without writing to the local filesystem.
 * @async
 * @param {string} gcsPath - The full GCS path (e.g., gs://bucket/path/to/file).
 * @param {string} originalName - The original name of the file, used to determine the file type.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {ApiError} If the file type is unsupported or if any extraction fails.
 */
const _extractTextFromFileUnprotected = async (gcsPath, originalName) => {
  if (!storage || !bucket) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'GCS is not configured, cannot extract text.'
    );
  }

  try {
    const bucketName = process.env.GCS_BUCKET_NAME;
    const filePathInBucket = gcsPath.replace(`gs://${bucketName}/`, '');
    const ext = path.extname(originalName).toLowerCase();

    logger.info(`Downloading from GCS for text extraction: ${gcsPath}`);
    const [fileBuffer] = await bucket.file(filePathInBucket).download();
    logger.info(
      `Extracting text from in-memory buffer for: ${originalName} (${ext})`
    );

    let text = '';

    switch (ext) {
      case '.pdf':
        text = await extractTextFromPDF(fileBuffer);
        break;
      case '.docx':
      case '.doc': // Attempt to process .doc with the .docx extractor
        text = await extractTextFromDOCX(fileBuffer);
        break;
      case '.txt':
        text = await extractTextFromTXT(fileBuffer);
        break;
      default:
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unsupported file type for text extraction: ${ext}`
        );
    }

    logger.info(
      `Successfully extracted ${text.length} characters from ${originalName}`
    );
    return text;
  } catch (error) {
    logger.error(`Error in extractTextFromFile for GCS path ${gcsPath}:`, error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process file from cloud storage.'
    );
  }
};

/**
 * Rate-limited public function to extract text from a file stored in GCS.
 * It downloads the file into a memory buffer and determines the file type
 * based on the original file name's extension.
 * @async
 * @param {string} gcsPath - The full GCS path (e.g., gs://bucket/path/to/file).
 * @param {string} originalName - The original name of the file, used to determine the file type.
 * @param {string} rateLimitKey - A unique identifier for the user or IP to apply rate limits against.
 * @returns {Promise<string>} A promise that resolves with the extracted text content.
 * @throws {ApiError} If the rate limit is exceeded, the file type is unsupported, or if any extraction fails.
 */
const extractTextFromFile = async (gcsPath, originalName, rateLimitKey) => {
  await handleRateLimit(textExtractionLimiter, rateLimitKey);
  return _extractTextFromFileUnprotected(gcsPath, originalName);
};

/**
 * Core logic to generate a v4 signed URL for direct client-side uploads to GCS.
 * This is the unprotected internal implementation.
 * @async
 * @param {string} filename - The original filename from the client.
 * @param {string} contentType - The MIME type of the file to be uploaded.
 * @param {object} [documentMetadata={}] - Optional metadata to associate with the document in GCS.
 * @returns {Promise<object>} A promise that resolves with the signed URL and GCS path.
 */
const _generateGCSUploadUrlUnprotected = async (
  filename,
  contentType,
  documentMetadata = {}
) => {
  if (!storage || !bucket) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'GCS not configured. Cannot generate upload URL.'
    );
  }

  try {
    const bucketName = process.env.GCS_BUCKET_NAME;
    const destination = `${STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId || 'anonymous'}/${Date.now()}_${filename}`;

    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: contentType,
      extensionHeaders: {
        'x-goog-meta-documenttype': documentMetadata.documentType || 'review',
        'x-goog-meta-uploadedat': new Date().toISOString(),
        'x-goog-meta-userid': documentMetadata.userId || 'anonymous',
        'x-goog-meta-originalname': documentMetadata.originalName || filename,
      },
    };

    const [signedUrl] = await bucket.file(destination).getSignedUrl(options);

    logger.info(`Generated signed URL for GCS upload to: ${destination}`);

    return {
      success: true,
      signedUrl,
      gcsPath: `gs://${bucketName}/${destination}`,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error generating GCS signed URL:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Could not generate file upload URL.'
    );
  }
};

/**
 * Rate-limited public function to generate a v4 signed URL for GCS uploads.
 * This allows clients to upload files directly to GCS, bypassing the server
 * and avoiding writing files to the local ephemeral filesystem.
 *
 * @security Multi-Tenant / User Isolation:
 * This function enforces logical tenant/user isolation by partitioning uploaded files
 * within the GCS bucket under a user-specific folder structure:
 * `${STORAGE_CONFIG.UPLOAD_FOLDER}/${userId || 'anonymous'}/${timestamp}_${filename}`.
 *
 * @async
 * @param {string} filename - The original filename from the client.
 * @param {string} contentType - The MIME type of the file to be uploaded.
 * @param {object} [documentMetadata={}] - Optional metadata to associate with the document in GCS.
 * @param {string} [documentMetadata.userId='anonymous'] - The ID of the user uploading the document (used for path isolation).
 * @param {string} [documentMetadata.documentType='review'] - The type of document (e.g., 'review', 'template').
 * @param {string} [documentMetadata.originalName] - The original name of the file before any renaming.
 * @param {string} rateLimitKey - A unique identifier for the user or IP to apply rate limits against.
 * @returns {Promise<object>} A promise that resolves with an object containing upload details.
 * @property {boolean} success - Indicates if the URL generation was successful.
 * @property {string} signedUrl - The v4 signed URL for the client to use for a PUT request.
 * @property {string} gcsPath - The destination Google Cloud Storage path (gs://...).
 * @property {string} storageType - Always 'gcs'.
 * @throws {ApiError} If the rate limit is exceeded or if GCS is not configured.
 */
const generateGCSUploadUrl = async (
  filename,
  contentType,
  documentMetadata = {},
  rateLimitKey
) => {
  await handleRateLimit(fileUploadLimiter, rateLimitKey);
  return _generateGCSUploadUrlUnprotected(
    filename,
    contentType,
    documentMetadata
  );
};

/**
 * Core logic to delete a document from Google Cloud Storage.
 * This is the unprotected internal implementation.
 * @async
 * @param {string} gcsPath - The Google Cloud Storage path (e.g., gs://your-bucket/path/to/file) of the document to delete.
 * @returns {Promise<object>} A promise that resolves with an object indicating success or failure.
 */
const _deleteDocumentFromGCSUnprotected = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    const bucketName = process.env.GCS_BUCKET_NAME;
    // Extract file path from gs:// URL
    const filePath = gcsPath.replace(`gs://${bucketName}/`, '');

    await bucket.file(filePath).delete();

    logger.info(`Document deleted from GCS: ${filePath}`);

    return { success: true, message: 'Document deleted successfully' };
  } catch (error) {
    logger.error('Error deleting document from GCS:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Rate-limited public function to delete a document from Google Cloud Storage.
 *
 * @security Multi-Tenant / User Isolation:
 * The caller must ensure that the user requesting deletion has ownership or permission
 * over the resource represented by the `gcsPath` before invoking this service.
 *
 * @async
 * @param {string} gcsPath - The Google Cloud Storage path (e.g., gs://your-bucket/path/to/file) of the document to delete.
 * @param {string} rateLimitKey - A unique identifier for the user or IP to apply rate limits against.
 * @returns {Promise<object>} A promise that resolves with an object indicating success or failure.
 * @property {boolean} success - True if deletion was successful, false otherwise.
 * @property {string} message - A message describing the outcome of the operation.
 * @throws {ApiError} If the rate limit is exceeded.
 */
const deleteDocumentFromGCS = async (gcsPath, rateLimitKey) => {
  await handleRateLimit(fileDeletionLimiter, rateLimitKey);
  return _deleteDocumentFromGCSUnprotected(gcsPath);
};

/**
 * Determines the MIME type of a file based on its extension.
 * @param {string} filename - The name of the file, including its extension.
 * @returns {string} The MIME type corresponding to the file extension, or 'application/octet-stream' if unknown.
 */
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.ppt': 'application/vnd.ms-powerpoint',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

/**
 * @typedef {object} FileProcessorService
 * @property {function(string, string, string): Promise<string>} extractTextFromFile - Extracts text from a file in GCS.
 * @property {function(Buffer): Promise<string>} extractTextFromPDF - Extracts text from a PDF file buffer.
 * @property {function(Buffer): Promise<string>} extractTextFromDOCX - Extracts text from a DOCX file buffer.
 * @property {function(Buffer): Promise<string>} extractTextFromTXT - Extracts text from a TXT file buffer.
 * @property {function(string, string, object, string): Promise<object>} generateGCSUploadUrl - Generates a signed URL for direct client-side GCS uploads.
 * @property {function(string, string): Promise<object>} deleteDocumentFromGCS - Deletes a document from Google Cloud Storage.
 * @property {function(string): string} getMimeType - Determines the MIME type of a file based on its extension.
 */

/**
 * An object containing all file processing utility functions.
 * @type {FileProcessorService}
 */
export const fileProcessor = {
  extractTextFromFile,
  extractTextFromPDF,
  extractTextFromDOCX,
  extractTextFromTXT,
  generateGCSUploadUrl,
  deleteDocumentFromGCS,
  getMimeType,
};

/**
 * Closes connections managed by this module, specifically the Redis client.
 * This function is designed to be called during a graceful shutdown process
 * initiated by the main server file (e.g., on a SIGTERM signal).
 * @async
 * @returns {Promise<void>}
 */
export const closeFileProcessorConnections = async () => {
  if (redisClient && redisClient.status === 'ready') {
    logger.info('Closing Redis client connection for rate limiting...');
    try {
      await redisClient.quit();
      logger.info('Redis client connection for rate limiting closed.');
    } catch (error) {
      logger.error('Error closing Redis client connection:', error);
    }
  }
};