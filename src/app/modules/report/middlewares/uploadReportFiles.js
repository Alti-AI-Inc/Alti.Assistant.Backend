/**
 * @file This module configures and exports a middleware for handling report file uploads directly to Google Cloud Storage.
 * It uses Multer to process files in memory, validates them, and then streams them to a GCS bucket.
 * It attaches GCS object information and a signed URL for access to each file object on the request.
 */

import multer from 'multer';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_INPUT_FORMATS,
  FILE_SIZE_LIMITS,
  MAX_FILES_PER_REQUEST,
} from '../report.constant.js';

// --- GCS Configuration ---
// This agent assumes Google Cloud authentication is handled via environment variables
// or service account credentials as per standard GCP practice.
// See: https://cloud.google.com/docs/authentication/getting-started
const storageClient = new Storage();
const bucketName = process.env.GCS_REPORTS_BUCKET;

if (!bucketName) {
  const errorMessage = 'CRITICAL: GCS_REPORTS_BUCKET environment variable not set. Report uploads will fail.';
  logger.error(errorMessage);
  console.error(errorMessage);
}
const bucket = storageClient.bucket(bucketName);

/**
 * @constant {multer.StorageEngine} storage - Multer memory storage configuration.
 * Files are stored in memory as Buffer objects and are never written to the local filesystem,
 * ensuring stateless container compatibility.
 */
const storage = multer.memoryStorage();

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
 * It uses memory storage, the defined file filter, and sets overall limits for file size and count.
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
 * @description Express middleware for handling report file uploads directly to Google Cloud Storage.
 * It wraps the Multer uploader to process files in memory, handles Multer-specific errors,
 * performs individual file size validation, and then streams valid files to a GCS bucket.
 * On success, it replaces `req.files` with an array of objects containing GCS metadata and a signed URL for each file.
 * @param {import('express').Request} req - The Express request object. On success, `req.files` will contain GCS file metadata.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 * @returns {void}
 *
 * @example
 * // Usage in an Express route:
 * router.post('/upload-report', uploadReportFiles, (req, res) => {
 *   // GCS file info is available in req.files
 *   res.status(200).json({ message: 'Files uploaded successfully to GCS', files: req.files });
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

    if (!req.files || req.files.length === 0) {
      return next();
    }

    // Validate individual file sizes based on their format.
    for (const file of req.files) {
      const sizeLimit = getSizeLimit(file.originalname);
      if (file.size > sizeLimit) {
        // No local file cleanup is needed as files are only in memory.
        return res.status(400).json({
          success: false,
          message: `File ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum size for its format (${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`,
        });
      }
    }

    // Create an array of promises for each GCS upload.
    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        // Define a path within the bucket for organization.
        const gcsFileName = `reports/${basename}-${uniqueSuffix}${ext}`;

        const blob = bucket.file(gcsFileName);
        const blobStream = blob.createWriteStream({
          resumable: false,
          contentType: file.mimetype,
        });

        blobStream.on('error', (uploadError) => {
          logger.error(`GCS stream error for ${gcsFileName}:`, uploadError);
          reject(uploadError);
        });

        blobStream.on('finish', async () => {
          try {
            const signedUrlConfig = {
              version: 'v4',
              action: 'read',
              expires: Date.now() + 60 * 60 * 1000, // 1 hour
            };
            const [url] = await blob.getSignedUrl(signedUrlConfig);

            // Resolve with GCS metadata. The original file buffer is discarded.
            resolve({
              fieldname: file.fieldname,
              originalname: file.originalname,
              encoding: file.encoding,
              mimetype: file.mimetype,
              size: file.size,
              bucket: bucketName,
              gcsName: gcsFileName,
              gcsUrl: url,
            });
          } catch (signedUrlError) {
            logger.error(`Failed to get signed URL for ${gcsFileName}:`, signedUrlError);
            reject(signedUrlError);
          }
        });

        blobStream.end(file.buffer);
      });
    });

    // Wait for all uploads to complete.
    Promise.all(uploadPromises)
      .then((gcsFiles) => {
        req.files = gcsFiles; // Replace original file data with GCS metadata.
        logger.info(`Uploaded ${gcsFiles.length} file(s) to GCS bucket '${bucketName}' successfully`);
        next();
      })
      .catch((uploadError) => {
        logger.error('One or more GCS uploads failed:', uploadError);
        res.status(500).json({
          success: false,
          message: 'Failed to upload files to cloud storage.',
          error: uploadError.message,
        });
      });
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