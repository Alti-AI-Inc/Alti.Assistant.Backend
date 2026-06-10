import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  DOCUMENT_REVIEW_CONFIG,
  STORAGE_CONFIG,
} from '../document_review.constant.js';

/**
 * @fileoverview Middleware configuration for uploading documents for review.
 * Utilizes multer to handle file uploads, validating file extensions and sizes.
 */

/**
 * The temporary directory path where uploaded files will be stored.
 * @type {string}
 */
const uploadDir = STORAGE_CONFIG.TEMP_FOLDER;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Multer disk storage configuration.
 * Defines the destination directory and generates a unique filename for each uploaded file.
 * @type {import('multer').StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Determines the destination directory for uploaded files.
   * 
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The uploaded file object.
   * @param {function(Error|null, string): void} cb - Callback to pass the destination path.
   */
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  /**
   * Generates a unique filename for the uploaded file to prevent naming collisions.
   * 
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The uploaded file object.
   * @param {function(Error|null, string): void} cb - Callback to pass the generated filename.
   */
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `review-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filters incoming files based on their file extension.
 * Only allows extensions specified in the document review configuration.
 * 
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The uploaded file object.
 * @param {function(Error|null, boolean): void} cb - Callback to accept or reject the file.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (DOCUMENT_REVIEW_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${DOCUMENT_REVIEW_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

/**
 * Multer middleware instance configured for document review uploads.
 * Validates file size and file type according to system configurations.
 * 
 * @type {import('multer').Multer}
 */
export const uploadDocumentReview = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_REVIEW_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadDocumentReview;