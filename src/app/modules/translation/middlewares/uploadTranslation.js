/**
 * @file Middleware for handling translation file uploads using Multer and applying rate limits.
 * @module app/modules/translation/middlewares/uploadTranslation
 * @author Your Name/Organization
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../../../config/redis.js'; // Assumes a shared Redis client instance is exported from this path
import {
  FILE_SIZE_LIMITS,
  STORAGE_CONFIG,
  SUPPORTED_DOCUMENT_FORMATS,
} from '../translation.constant.js';

// --- Rate Limiting Configuration ---

// Create a new Redis store for the rate limiters to share state across multiple processes/servers.
const store = new RedisStore({
  // @ts-ignore
  sendCommand: (...args) => redisClient.sendCommand(args),
});

/**
 * Rate limiter for authenticated users uploading translation files.
 * Limits each user to 20 uploads per 15 minutes.
 * This helps prevent abuse from a single compromised account and controls costs.
 * It should be applied in the route chain *before* the multer middleware.
 *
 * @constant {function}
 * @example
 * // Usage in a route:
 * // router.post('/upload', authMiddleware, uploadLimiterAuthenticated, uploadTranslation.single('file'), controller);
 */
export const uploadLimiterAuthenticated = rateLimit({
  store,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each authenticated user to 20 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use the user ID from the request object (set by an auth middleware) as the key.
    // Fallback to IP if user ID is not available, though `skip` should prevent this.
    return req.user?.id || req.ip;
  },
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      message: 'Too many file upload attempts. Please try again in 15 minutes.',
    });
  },
  skip: (req) => !req.user, // Only apply this limiter if the user is authenticated.
});

/**
 * Rate limiter for public (unauthenticated) users uploading translation files.
 * Limits each IP address to 5 uploads per 15 minutes.
 * This is a crucial first line of defense against DDOS and anonymous API abuse.
 * It should be applied in the route chain *before* the multer middleware.
 *
 * @constant {function}
 * @example
 * // Usage in a route:
 * // router.post('/public/upload', uploadLimiterPublic, uploadTranslation.single('file'), controller);
 */
export const uploadLimiterPublic = rateLimit({
  store,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    res.status(options.statusCode).json({
      message: 'Too many file upload attempts from this IP. Please try again in 15 minutes.',
    });
  },
  skip: (req) => !!req.user, // Skip this limiter if the user is authenticated (the other limiter will apply).
});

// --- Multer File Upload Configuration ---

/**
 * The directory where uploaded files will be temporarily stored.
 * This path is configured in `STORAGE_CONFIG.TEMP_FOLDER`.
 * @type {string}
 */
const uploadDir = STORAGE_CONFIG.TEMP_FOLDER;

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  /**
   * Creates the upload directory if it does not already exist.
   * The `recursive: true` option ensures that any necessary parent directories are also created.
   */
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configures the disk storage for Multer.
 * This defines where files are stored and how they are named.
 * @type {multer.StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Determines the destination directory for uploaded files.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the destination.
   */
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  /**
   * Determines the filename for uploaded files.
   * Generates a unique filename using a timestamp and a random number, preserving the original file extension.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the filename.
   */
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `translation-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filters incoming files to ensure only supported document formats are uploaded.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (SUPPORTED_DOCUMENT_FORMATS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${SUPPORTED_DOCUMENT_FORMATS.join(', ')}`
      ),
      false
    );
  }
};

/**
 * Multer instance configured for handling translation file uploads.
 * It uses the defined `storage`, `fileFilter`, and `FILE_SIZE_LIMITS`.
 * This instance can be used as middleware in Express routes to process file uploads.
 * @type {multer.Multer}
 */
export const uploadTranslation = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMITS.MAX_FILE_SIZE,
  },
});

/**
 * Default export of the configured Multer upload instance.
 * @type {multer.Multer}
 */
export default uploadTranslation;