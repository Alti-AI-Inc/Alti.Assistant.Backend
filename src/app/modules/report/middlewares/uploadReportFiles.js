/**
 * @file This module configures and exports a middleware for handling report file uploads directly to Google Cloud Storage.
 * It uses Multer to process files in memory, validates them, and then streams them to a GCS bucket.
 * It attaches GCS object information and a signed URL for access to each file object on the request.
 */

import multer from 'multer';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_INPUT_FORMATS,
  FILE_SIZE_LIMITS,
  MAX_FILES_PER_REQUEST,
} from '../report.constant.js';

import GCSStorageEngine from '../../../middlewares/uploader/uploader.js';

// --- GCS Configuration ---
const bucketName = process.env.GCS_REPORTS_BUCKET;

if (!bucketName) {
  const errorMessage = 'CRITICAL: GCS_REPORTS_BUCKET environment variable not set. Report uploads will fail.';
  logger.error(errorMessage);
  console.error(errorMessage);
}

/**
 * @function fileFilter
 * @description Multer file filter function to validate file types.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);

  if (!SUPPORTED_INPUT_FORMATS.includes(ext)) {
    logger.warn(`Rejected file with unsupported format: ${ext}`);
    return cb(
      new Error(
        `File format .${ext} is not supported. Allowed formats: ${SUPPORTED_INPUT_FORMATS.join(', ')}`
      ),
      false
    );
  }

  cb(null, true);
};

const storage = new GCSStorageEngine({
  bucketName: bucketName,
  destination: (req, file, cb) => {
    cb(null, 'reports');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

/**
 * @constant {multer.Multer} reportFileUploader - Configured Multer instance for report file uploads.
 */
const reportFileUploader = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: Math.max(...Object.values(FILE_SIZE_LIMITS)),
    files: MAX_FILES_PER_REQUEST,
  },
}).array('files', MAX_FILES_PER_REQUEST);

export const uploadReportFiles = (req, res, next) => {
  reportFileUploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      logger.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File size exceeds maximum allowed size`,
          error: err.message,
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: `Maximum ${MAX_FILES_PER_REQUEST} files allowed`,
          error: err.message,
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message,
      });
    } else if (err) {
      logger.error('Upload error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Unknown upload error',
      });
    }
    
    // Additional individual file size validation logic can be added here if needed, 
    // but GCSStorageEngine handles the stream directly so size limits are best enforced at the Multer limits level.
    
    next();
  });
};

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('multer').MulterError} MulterError
 */

/**
 * @exports uploadReportFiles as default
 * @description The default export is the `uploadReportFiles` middleware function.
 */
export default uploadReportFiles;