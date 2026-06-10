import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
// Assuming a shared Redis client is available for the application
import redisClient from '../../../../../core/redis/redis.client.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DOCUMENT_ANALYSIS_CONFIG } from '../document_analysis.constant.js';

/**
 * @fileoverview Middleware configuration for handling document uploads for analysis.
 * Sets up disk storage, file validation, and size limits using Multer.
 * Includes a rate limiter to protect against DDOS and API abuse.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create upload directory if it doesn't exist
const uploadDir = path.join(
  __dirname,
  '../../../../../uploads/document_analysis'
);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Multer disk storage configuration for document analysis uploads.
 * Configures the destination directory and generates a unique filename
 * using a timestamp and a random suffix to prevent naming collisions.
 *
 * @type {import('multer').StorageEngine}
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `analysis-${uniqueSuffix}${ext}`);
  },
});

/**
 * File filter function for Multer to validate uploaded file extensions.
 * Compares the file extension against the allowed extensions defined in
 * {@link DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS}.
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
    cb(
      new Error(
        `Unsupported file type. Supported types: ${DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

/**
 * @description Rate limiter for the document upload endpoint.
 * This is a critical security measure to prevent DDOS attacks, API abuse, and
 * resource exhaustion (disk space, CPU, network bandwidth) from rapid, repeated uploads.
 * It uses a Redis store for distributed environments and applies different limits
 * for authenticated users vs. anonymous IPs.
 */
const documentUploadLimiter = rateLimit({
  // Store session data in Redis, essential for distributed/clustered environments.
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  // 1-hour window for the rate limit.
  windowMs: 60 * 60 * 1000,
  // Dynamically set the maximum number of requests based on authentication status.
  // Authenticated users get a higher limit than anonymous IPs.
  max: (req, res) => (req.user ? 20 : 10), // 20 uploads/hr for users, 10/hr for IPs.
  // Custom message to be sent when the rate limit is exceeded.
  message: {
    status: 429,
    message: 'Too many document uploads. Please try again after an hour.',
  },
  // Use modern `RateLimit-*` headers.
  standardHeaders: true,
  // Disable legacy `X-RateLimit-*` headers.
  legacyHeaders: false,
  // Generate a unique key for rate limiting. Prioritizes authenticated user ID,
  // falling back to the request IP address for anonymous requests.
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
 * This is the core middleware for handling the file parsing and saving.
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
 * It combines the security rate limiter with the Multer file handling middleware.
 * When used in a route (e.g., `router.post('/upload', uploadDocumentAnalysis, ...)`),
 * Express will execute the middlewares in the provided order.
 * 1. `documentUploadLimiter`: Checks if the request is within the allowed rate.
 * 2. `multerUpload`: If the rate is okay, it processes the file upload.
 */
export const uploadDocumentAnalysis = [documentUploadLimiter, multerUpload];