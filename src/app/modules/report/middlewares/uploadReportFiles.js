/**
 * @file This module configures and exports a Multer middleware for handling report file uploads.
 * It includes file type validation, size limits, and error handling for various upload scenarios.
 * It also provides a utility function for cleaning up uploaded files.
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_INPUT_FORMATS,
  FILE_SIZE_LIMITS,
  MAX_FILES_PER_REQUEST,
} from '../report.constant.js';

/**
 * @constant {string} uploadDir - The directory where uploaded report files will be stored.
 * This directory is created if it does not already exist.
 */
const uploadDir = 'uploads/reports';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * @constant {multer.StorageEngine} storage - Multer disk storage configuration.
 * Defines where to store files and how to name them.
 */
const storage = multer.diskStorage({
  /**
   * Determines the destination directory for uploaded files.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to specify the destination.
   */
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  /**
   * Determines the filename for uploaded files.
   * Generates a unique filename using a timestamp and a random number to prevent collisions.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to specify the filename.
   */
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

/**
 * @function fileFilter
 * @description Multer file filter function to validate file types.
 * Only allows files with extensions listed in `SUPPORTED_INPUT_FORMATS`.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 * @returns {void}
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

/**
 * @function getSizeLimit
 * @description Retrieves the maximum allowed file size for a given filename based on its extension.
 * If the extension is not explicitly defined in `FILE_SIZE_LIMITS`, it returns the default limit.
 * @param {string} filename - The name of the file, including its extension.
 * @returns {number} The maximum allowed file size in bytes.
 */
const getSizeLimit = (filename) => {
  const ext = path.extname(filename).toLowerCase().substring(1).toUpperCase();
  return FILE_SIZE_LIMITS[ext] || FILE_SIZE_LIMITS.DEFAULT;
};

/**
 * @constant {multer.Multer} reportFileUploader - Configured Multer instance for report file uploads.
 * It uses the defined storage, file filter, and sets overall limits for file size and count.
 * It expects files to be sent under the field name 'files' as an array.
 */
const reportFileUploader = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    // Multer's overall file size limit is set to the maximum of all defined limits
    // to allow individual file size validation later based on format.
    fileSize: Math.max(...Object.values(FILE_SIZE_LIMITS)),
    files: MAX_FILES_PER_REQUEST,
  },
}).array('files', MAX_FILES_PER_REQUEST);

/**
 * @function uploadReportFiles
 * @description Express middleware for handling report file uploads.
 * It wraps the Multer uploader, provides comprehensive error handling for Multer-specific errors
 * (e.g., file size, file count), and performs additional validation for individual file sizes
 * based on their specific formats. If validation fails, it cleans up any partially uploaded files.
 * @param {import('express').Request} req - The Express request object. `req.files` will contain uploaded files on success.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {void}
 * @throws {MulterError} If a Multer-specific error occurs (e.g., `LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`).
 * @throws {Error} If an unsupported file format is uploaded or a custom size validation fails.
 *
 * @example
 * // Usage in an Express route:
 * router.post('/upload-report', uploadReportFiles, (req, res) => {
 *   // Files are available in req.files
 *   res.status(200).json({ message: 'Files uploaded successfully', files: req.files });
 * });
 */
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

    // Validate individual file sizes based on their format
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const sizeLimit = getSizeLimit(file.originalname);
        if (file.size > sizeLimit) {
          // Clean up uploaded files
          req.files.forEach((f) => {
            // Ensure synchronous file deletion is robust against errors
            try {
              if (fs.existsSync(f.path)) {
                fs.unlinkSync(f.path);
              }
            } catch (cleanupError) {
              logger.error(`Error cleaning up file ${f.path} after size validation failure:`, cleanupError);
            }
          });

          return res.status(400).json({
            success: false,
            message: `File ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum size for its format (${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`,
          });
        }
      }

      logger.info(`Uploaded ${req.files.length} file(s) successfully`);
    }

    next();
  });
};

/**
 * @function cleanupUploadedFiles
 * @description Deletes an array of files from the filesystem.
 * This utility function is typically used to remove temporary files after processing
 * or in error recovery scenarios.
 * @param {Express.Multer.File[]} files - An array of file objects, typically from `req.files` after a Multer upload.
 * Each file object must have a `path` property indicating its location on the disk.
 * @returns {void}
 *
 * @example
 * // In a route handler after processing files:
 * router.post('/process-report', uploadReportFiles, async (req, res) => {
 *   try {
 *     // Process files...
 *     await processFiles(req.files);
 *     res.status(200).json({ message: 'Files processed successfully' });
 *   } catch (error) {
 *     logger.error('Error processing files:', error);
 *     // Clean up files if processing failed
 *     cleanupUploadedFiles(req.files);
 *     res.status(500).json({ message: 'Failed to process files', error: error.message });
 *   } finally {
 *     // Always clean up files after they are no longer needed
 *     cleanupUploadedFiles(req.files);
 *   }
 * });
 */
export const cleanupUploadedFiles = (files) => {
  if (!files || !Array.isArray(files)) {
    return;
  }

  files.forEach((file) => {
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        logger.info(`Cleaned up file: ${file.path}`);
      }
    } catch (error) {
      logger.error(`Error cleaning up file ${file.path}:`, error);
    }
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