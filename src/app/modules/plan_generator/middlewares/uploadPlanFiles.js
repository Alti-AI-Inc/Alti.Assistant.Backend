/**
 * @file This file configures and exports a Multer middleware for handling plan file uploads.
 * It sets up disk storage, defines file naming conventions, and implements file filtering
 * based on allowed extensions, MIME types, and file size limits specified in `PLAN_GENERATOR_CONFIG`.
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
 * The directory where uploaded plan files will be stored.
 * It is created if it does not already exist.
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
   * Sets the destination directory for uploaded files.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the destination.
   */
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  /**
   * Generates a unique filename for the uploaded file.
   * The filename includes a 'plan-' prefix, the original base name, a unique timestamp-based suffix, and the original extension.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the filename.
   */
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    cb(null, `plan-${baseName}-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filters uploaded files based on their extension and MIME type.
 * Only files with extensions and MIME types listed in `PLAN_GENERATOR_CONFIG` are allowed.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
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