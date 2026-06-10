import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DOCUMENT_ANALYSIS_CONFIG } from '../document_analysis.constant.js';

/**
 * @fileoverview Middleware configuration for handling document uploads for analysis.
 * Sets up disk storage, file validation, and size limits using Multer.
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
 * Multer middleware instance configured for document analysis uploads.
 * Enforces file size limits and file type restrictions.
 * 
 * @type {import('multer').Multer}
 */
export const uploadDocumentAnalysis = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_ANALYSIS_CONFIG.MAX_FILE_SIZE,
  },
});