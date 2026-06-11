/**
 * @file Middleware for handling translation file uploads using Multer and applying rate limits.
 * @module app/modules/translation/middlewares/uploadTranslation
 * @author Your Name/Organization
 *
 * @description
 * This file provides a comprehensive set of middlewares for handling file uploads securely and efficiently.
 * It includes:
 * - Role-aware, tenant-isolated file upload handling.
 * - Dynamic configuration of limits (e.g., file size) based on user role and workspace subscription.
 * - Pre-upload validation to check against usage quotas (e.g., monthly document limits).
 * - Robust rate limiting for both authenticated and public users to prevent abuse.
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

// --- FIX: Added placeholder imports for required services and custom error handling.
// In a real application, these would point to the actual modules.
// These services are crucial for enforcing business logic and tenant boundaries.
import WorkspaceService from '../../workspace/workspace.service.js'; // Assumed path and service
import UsageService from '../../usage/usage.service.js'; // Assumed path and service
import ApiError from '../../../utils/ApiError.js'; // Assumed path to a custom error class

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
 * It should be applied in the route chain *before* the upload middleware.
 *
 * @constant {function}
 * @example
 * // Usage in a route:
 * // router.post('/upload', authMiddleware, uploadLimiterAuthenticated, translationUploadMiddleware, controller);
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
    // FIX: Use ApiError for consistent error responses.
    next(
      new ApiError(
        options.statusCode,
        'Too many file upload attempts. Please try again in 15 minutes.'
      )
    );
  },
  skip: (req) => !req.user, // Only apply this limiter if the user is authenticated.
});

/**
 * Rate limiter for public (unauthenticated) users uploading translation files.
 * Limits each IP address to 5 uploads per 15 minutes.
 * This is a crucial first line of defense against DDOS and anonymous API abuse.
 * It should be applied in the route chain *before* the upload middleware.
 *
 * @constant {function}
 * @example
 * // Usage in a route:
 * // router.post('/public/upload', uploadLimiterPublic, translationUploadMiddleware, controller);
 */
export const uploadLimiterPublic = rateLimit({
  store,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    // FIX: Use ApiError for consistent error responses.
    next(
      new ApiError(
        options.statusCode,
        'Too many file upload attempts from this IP. Please try again in 15 minutes.'
      )
    );
  },
  skip: (req) => !!req.user, // Skip this limiter if the user is authenticated (the other limiter will apply).
});

// --- Multer File Upload Configuration ---

/**
 * The root directory where uploaded files will be temporarily stored.
 * This path is configured in `STORAGE_CONFIG.TEMP_FOLDER`.
 * @type {string}
 */
const uploadDir = STORAGE_CONFIG.TEMP_FOLDER;

// Ensure the root upload directory exists
if (!fs.existsSync(uploadDir)) {
  /**
   * Creates the upload directory if it does not already exist.
   * The `recursive: true` option ensures that any necessary parent directories are also created.
   */
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * @typedef {object} UploadContext
 * @property {string} destinationDir - The full path to the directory where the file will be saved.
 * @property {number} fileSizeLimit - The maximum allowed file size in bytes for this upload.
 * @property {boolean} bypassUsageCheck - Whether to skip usage quota checks (e.g., for super_admins).
 * @property {string} [workspaceId] - The ID of the workspace associated with the upload.
 */

/**
 * An advanced, dynamic middleware for handling file uploads.
 *
 * This middleware replaces a static multer configuration with a dynamic one that adapts to the request context.
 * It performs the following critical tasks:
 * 1.  **Authorization & Pre-validation**: Checks user authentication and role. Fetches workspace-specific settings and usage data before the upload begins.
 * 2.  **Tenant Isolation**: Creates and uses a unique subdirectory for each workspace (`{temp_folder}/{workspaceId}`), preventing data leakage between tenants.
 * 3.  **Dynamic Limits**: Configures multer's file size limit based on the workspace's subscription plan or the user's role (e.g., `super_admin`).
 * 4.  **Usage Quota Enforcement**: Rejects uploads if the workspace has exceeded its monthly document limit.
 * 5.  **Graceful Error Handling**: Catches and standardizes errors from the validation and upload process.
 * 6.  **Context Propagation**: Attaches an `uploadContext` object to the request for use in subsequent controllers (e.g., to update usage statistics).
 *
 * @param {import('express').Request} req - The Express request object, expected to have `req.user` populated by an auth middleware.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 */
export const translationUploadMiddleware = async (req, res, next) => {
  try {
    // --- 1. Pre-Upload Validation & Context Setup (Async) ---
    if (!req.user) {
      // This should be caught by an auth middleware, but serves as a safeguard.
      return next(new ApiError(401, 'Authentication required for file upload.'));
    }

    /** @type {UploadContext} */
    let uploadContext;

    // Handle special permissions for super_admin role
    if (req.user.role === 'super_admin') {
      uploadContext = {
        destinationDir: path.join(uploadDir, 'super_admin'),
        fileSizeLimit: FILE_SIZE_LIMITS.SUPER_ADMIN_MAX_FILE_SIZE,
        bypassUsageCheck: true,
      };
    } else {
      // For all other roles, enforce workspace-based limits and tenancy.
      if (!req.user.workspaceId) {
        return next(new ApiError(400, 'User is not associated with a workspace.'));
      }

      const workspace = await WorkspaceService.findById(req.user.workspaceId);
      if (!workspace || !workspace.plan) {
        return next(new ApiError(404, 'Workspace or subscription plan not found.'));
      }

      // Check usage limits before allowing the upload to start.
      const { usage, limits } = await UsageService.getWorkspaceUsage(workspace.id);
      if (usage.monthlyDocuments >= limits.monthlyDocuments) {
        return next(
          new ApiError(429, 'Workspace has exceeded its monthly document upload limit.')
        );
      }

      uploadContext = {
        destinationDir: path.join(uploadDir, workspace.id),
        fileSizeLimit: workspace.plan.maxFileSize,
        bypassUsageCheck: false,
        workspaceId: workspace.id,
      };
    }

    // Ensure the specific destination directory for the tenant/role exists.
    if (!fs.existsSync(uploadContext.destinationDir)) {
      fs.mkdirSync(uploadContext.destinationDir, { recursive: true });
    }

    // --- 2. Dynamic Multer Configuration ---
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadContext.destinationDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `translation-${uniqueSuffix}${ext}`);
      },
    });

    const fileFilter = (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (SUPPORTED_DOCUMENT_FORMATS.includes(ext)) {
        cb(null, true);
      } else {
        // Reject the file with a specific error.
        cb(
          new Error(
            `File type not supported. Allowed types: ${SUPPORTED_DOCUMENT_FORMATS.join(', ')}`
          )
        );
      }
    };

    const upload = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: {
        fileSize: uploadContext.fileSizeLimit,
      },
    }).single('file'); // Assuming the form field name is 'file'

    // --- 3. Execute Multer Middleware ---
    upload(req, res, (err) => {
      // --- 4. Handle Multer-specific errors ---
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            const limitInMb = (uploadContext.fileSizeLimit / (1024 * 1024)).toFixed(2);
            return next(
              new ApiError(413, `File is too large. Maximum size is ${limitInMb} MB.`)
            );
          }
          return next(new ApiError(400, `File upload error: ${err.message}`));
        }
        // Handle custom errors from fileFilter or other sources.
        return next(new ApiError(400, err.message));
      }

      // Attach context to the request for the controller to use (e.g., for usage tracking).
      req.uploadContext = uploadContext;

      // Proceed to the next middleware/controller if upload is successful.
      next();
    });
  } catch (error) {
    // Catch and forward any errors from async operations (e.g., database queries).
    next(error);
  }
};