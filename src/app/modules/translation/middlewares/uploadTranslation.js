/**
 * @file Middleware for handling translation file uploads using Multer.
 * @module app/modules/translation/middlewares/uploadTranslation
 * @author Your Name/Organization
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  FILE_SIZE_LIMITS,
  STORAGE_CONFIG,
  SUPPORTED_DOCUMENT_FORMATS,
} from '../translation.constant.js';

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