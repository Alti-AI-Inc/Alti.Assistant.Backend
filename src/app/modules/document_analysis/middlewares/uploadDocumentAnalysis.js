import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { RedisClient } from '../../../../shared/redis.js';
import multer from 'multer';
import path from 'path';
import { DOCUMENT_ANALYSIS_CONFIG } from '../document_analysis.constant.js';
import { GCSStorageEngine } from '../../../../app/middlewares/uploder/uploder.js';

/**
 * File filter function for Multer to validate uploaded file extensions.
 * Compares the file extension against an allow-list defined in configuration.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The metadata of the uploaded file.
 * @param {function(Error|null, boolean): void} cb - Callback to accept or reject the file.
 */
const fileFilter = (req, file, cb) => {
  if (!req.user || !req.user.id) {
    const authError = new Error('Authentication is required to upload documents.');
    authError.status = 401; // Unauthorized
    return cb(authError);
  }

  const ext = path.extname(file.originalname).toLowerCase();

  if (DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    const error = new Error(
      `Unsupported file type. Supported types: ${DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
    );
    error.status = 415; // Unsupported Media Type
    cb(error, false);
  }
};

/**
 * @description Rate limiter for the document upload endpoint.
 */
const documentUploadLimiter = rateLimit({
  store: RedisClient.isEnabled
    ? new RedisStore({
        sendCommand: async (...args) => {
          return await RedisClient.rateLimitSendCommand(args);
        },
      })
    : undefined,
  windowMs: 60 * 60 * 1000,
  max: (req, res) => (req.user ? 20 : 10),
  message: {
    status: 429,
    message: 'Too many document uploads. Please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    return req.user ? req.user.id : req.ip;
  },
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
 */
const multerUpload = multer({
  storage: new GCSStorageEngine({ folder: 'document_analysis' }),
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_ANALYSIS_CONFIG.MAX_FILE_SIZE,
  },
});

export const uploadDocumentAnalysis = [documentUploadLimiter, multerUpload];