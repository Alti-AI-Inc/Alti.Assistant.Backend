import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
// Assuming a shared Redis client is available for the application
import { RedisClient } from '../../../../shared/redis.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DOCUMENT_ANALYSIS_CONFIG } from '../document_analysis.constant.js';

/**
 * @fileoverview Middleware configuration for handling document uploads for analysis.
 * Sets up disk storage with user-data isolation, file validation, and size limits.
 * Includes a rate limiter to protect against DDOS and API abuse.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the base upload directory if it doesn't exist.
// User-specific subdirectories will be created on-demand.
const uploadDir = path.join(
  __dirname,
  '../../../../../uploads/document_analysis'
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Multer disk storage configuration for document analysis uploads.
 * This configuration ensures that each user's files are stored in a separate,
 * isolated directory, which is critical for security and data privacy.
 *
 * @type {import('multer').StorageEngine}
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // User data isolation is a core requirement.
    // This check ensures that only authenticated users can upload files.
    // The upstream rate-limiter handles unauthenticated attempts to prevent abuse.
    if (!req.user || !req.user.id) {
      const authError = new Error('Authentication is required to upload documents.');
      authError.status = 401; // Unauthorized
      return cb(authError);
    }

    // Create a user-specific directory path to ensure data is isolated.
    const userUploadDir = path.join(uploadDir, String(req.user.id));

    try {
      // Ensure the user's personal directory exists, creating it if necessary.
      // This is a critical step for organizing, securing, and managing user files and quotas.
      fs.mkdirSync(userUploadDir, { recursive: true });
      cb(null, userUploadDir);
    } catch (error) {
      // If directory creation fails, it's a server-side issue.
      console.error(
        `Critical: Failed to create upload directory for user ${req.user.id}. Path: ${userUploadDir}`,
        error
      );
      const dirError = new Error('Could not process file upload due to a server error.');
      dirError.status = 500; // Internal Server Error
      cb(dirError);
    }
  },
  filename: function (req, file, cb) {
    // Generate a secure and unique filename to prevent collisions and overwrite issues.
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `analysis-${uniqueSuffix}${ext}`);
  },
});

/**
 * File filter function for Multer to validate uploaded file extensions.
 * Compares the file extension against an allow-list defined in configuration.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The metadata of the uploaded file.
 * @param {function(Error|null, boolean): void} cb - Callback to accept or reject the file.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    // Reject the file with a structured error for consistent API client handling.
    const error = new Error(
      `Unsupported file type. Supported types: ${DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
    );
    error.status = 415; // Unsupported Media Type
    cb(error, false);
  }
};

/**
 * @description Rate limiter for the document upload endpoint.
 * This is a critical security measure to prevent DDOS attacks, API abuse, and
 * resource exhaustion from rapid, repeated uploads. It uses a Redis store for
 * scalability and applies different limits for authenticated vs. anonymous requests.
 */
const documentUploadLimiter = rateLimit({
  // Store session data in Redis, essential for distributed/clustered environments.
  // Falls back to in-memory store if Redis is not connected yet.
  store: RedisClient.isEnabled
    ? new RedisStore({
        sendCommand: async (...args) => {
          return await RedisClient.rateLimitSendCommand(args);
        },
      })
    : undefined,
  // 1-hour window for the rate limit.
  windowMs: 60 * 60 * 1000,
  // Dynamically set the maximum number of requests based on authentication status.
  // Authenticated users get a higher limit. Anonymous requests are limited to prevent abuse,
  // even though they will be rejected by the storage middleware.
  max: (req, res) => (req.user ? 20 : 10), // 20 uploads/hr for users, 10/hr for IPs.
  // Custom message to be sent when the rate limit is exceeded.
  message: {
    status: 429,
    message: 'Too many document uploads. Please try again after an hour.',
  },
  // Use modern `RateLimit-*` headers for standards compliance.
  standardHeaders: true,
  // Disable legacy `X-RateLimit-*` headers.
  legacyHeaders: false,
  // Generate a unique key for rate limiting. Prioritizes authenticated user ID
  // for per-user limits, falling back to IP for anonymous requests.
  keyGenerator: (req, res) => {
    return req.user ? req.user.id : req.ip;
  },
  // Custom handler to add logging for security monitoring when a limit is hit.
  handler: (req, res, next, options) => {
    const key = options.keyGenerator(req, res);
    const limit =
      typeof options.max === 'function' ? options.max(req, res) : options.max;
    console.warn(
      `Rate limit exceeded for document upload by key "${key}". Limit: ${limit} requests per ${options.windowMs}ms.`
    );
    res.status(options.statusCode).send(options.message);
  },
});

/**
 * Multer middleware instance configured for document analysis uploads.
 * It integrates the user-isolating storage, file type validation, and size limits.
 *
 * @type {import('multer').Multer}
 */
const multerUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_ANALYSIS_CONFIG.MAX_FILE_SIZE,
  },
});

/**
 * Exported middleware chain for document analysis uploads.
 * This chain enforces security and validation rules in the correct order.
 * 1. `documentUploadLimiter`: First, check if the request is within the allowed rate.
 * 2. `multerUpload`: If the rate is acceptable, process the file upload, which
 *    includes authentication checks, user-directory creation, and file validation.
 */
export const uploadDocumentAnalysis = [documentUploadLimiter, multerUpload];