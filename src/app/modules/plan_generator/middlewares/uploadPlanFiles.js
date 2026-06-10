/**
 * @file This file configures and exports a Multer middleware for handling plan file uploads.
 * It sets up disk storage, defines file naming conventions, and implements file filtering
 * based on allowed extensions, MIME types, and file size limits specified in `PLAN_GENERATOR_CONFIG`.
 * It includes critical security and multi-tenancy enhancements.
 * @module middlewares/uploadPlanFiles
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ApiError from '../../../../errors/ApiError.js';
import { PLAN_GENERATOR_CONFIG } from '../plan_generator.constant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The root directory where uploaded plan files will be stored.
 * Tenant-specific subdirectories will be created inside this directory.
 * @type {string}
 */
const uploadDir = path.join(process.cwd(), 'uploads', 'plan_files');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configures Multer's disk storage engine.
 * Defines the destination directory and the filename generation logic for uploaded files.
 * @type {multer.StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Sets the destination directory for uploaded files, ensuring tenant isolation.
   * @param {import('express').Request} req - The Express request object, expected to have `req.user` populated by auth middleware.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the destination.
   */
  destination: function (req, file, cb) {
    // CRITICAL SECURITY FIX: Enforce tenant isolation by storing files in a workspace-specific directory.
    // This prevents data leakage between tenants (a form of Insecure Direct Object Reference - IDOR).
    // This middleware must run after an authentication middleware that populates req.user.
    if (!req.user || !req.user.workspaceId) {
      return cb(new ApiError(401, 'Authentication error: Workspace context is missing.'));
    }
    const tenantUploadDir = path.join(uploadDir, String(req.user.workspaceId));

    // Ensure the tenant-specific directory exists.
    try {
      // Using mkdirSync for simplicity within the Multer callback structure.
      // In a high-concurrency scenario, an async queue might be considered.
      if (!fs.existsSync(tenantUploadDir)) {
        fs.mkdirSync(tenantUploadDir, { recursive: true });
      }
      cb(null, tenantUploadDir);
    } catch (error) {
      // Log the internal error for debugging, but send a generic message to the client.
      console.error('CRITICAL: Failed to create tenant upload directory:', error);
      cb(new ApiError(500, 'File storage configuration error.'));
    }
  },
  /**
   * Generates a unique, non-user-controlled filename for the uploaded file.
   * The filename includes workspace and user IDs for traceability.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the filename.
   */
  filename: function (req, file, cb) {
    // INTEGRATION & SECURITY FIX: Add workspace and user IDs to the filename for better traceability and auditing.
    // This also avoids using user-provided input (file.originalname) directly in the filename, preventing path traversal and other attacks.
    if (!req.user || !req.user.id || !req.user.workspaceId) {
      return cb(new ApiError(401, 'Authentication error: User or Workspace context is missing.'));
    }
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `plan-ws-${req.user.workspaceId}-user-${req.user.id}-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filters uploaded files based on role, extension, and MIME type.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  // HIERARCHY & SECURITY FIX: Validate user role before processing the file.
  // This ensures that only authorized users can upload files, respecting the role hierarchy.
  // Assuming 'user' role is not permitted to generate/upload plans.
  const allowedRoles = ['super_admin', 'admin', 'manager'];
  if (!req.user || !req.user.role || !allowedRoles.includes(req.user.role)) {
    return cb(
      new ApiError(403, 'Forbidden: You do not have permission to upload plan files.'),
      false
    );
  }

  const ext = path.extname(file.originalname).toLowerCase();

  if (!PLAN_GENERATOR_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    return cb(
      new ApiError(
        400,
        `Invalid file type. Supported formats: ${PLAN_GENERATOR_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }

  if (!PLAN_GENERATOR_CONFIG.SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new ApiError(
        400,
        `Invalid file MIME type. Supported types: ${PLAN_GENERATOR_CONFIG.SUPPORTED_MIME_TYPES.join(', ')}`
      ),
      false
    );
  }

  // INTEGRATION NOTE: Tenant-specific usage limits (e.g., total storage quota) should be checked
  // in the controller *after* the file is successfully uploaded but *before* it is permanently saved.
  // This allows for accurate file size measurement and atomic database updates for usage tracking.
  // This middleware ensures the preliminary checks (auth, role, file type) pass.

  cb(null, true);
};

/**
 * Multer middleware instance configured for plan file uploads.
 * It uses the defined storage, file filter, and applies a file size limit.
 * This middleware can be used in Express routes to handle `multipart/form-data` for file uploads.
 * @type {multer.Multer}
 */
export const uploadPlanFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: PLAN_GENERATOR_CONFIG.MAX_FILE_SIZE,
  },
});