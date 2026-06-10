/**
 * @file This file configures and exports a Multer middleware for handling plan file uploads.
 * It streams files directly to a Google Cloud Storage (GCS) bucket, avoiding the local filesystem.
 * It also implements file filtering based on allowed extensions, MIME types, and file size limits
 * specified in `PLAN_GENERATOR_CONFIG`.
 * @module middlewares/uploadPlanFiles
 */

import multer from 'multer';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import ApiError from '../../../../errors/ApiError.js';
import { PLAN_GENERATOR_CONFIG } from '../plan_generator.constant.js';

// Initialize the Google Cloud Storage client.
// Assumes GOOGLE_APPLICATION_CREDENTIALS environment variable is set for authentication.
const gcs = new Storage();

// Get the GCS bucket for storing plan files.
// This bucket name must be configured in your environment/config files.
const bucket = gcs.bucket(PLAN_GENERATOR_CONFIG.GCS_BUCKET_NAME);

/**
 * A custom Multer storage engine that streams uploads directly to Google Cloud Storage.
 * This avoids saving files to the local ephemeral filesystem, which is essential for
 * stateless containerized environments.
 */
class GcsStorage {
  /**
   * Handles the incoming file stream from Multer and pipes it to GCS.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, Object): void} cb - The callback function to signal completion or error.
   */
  _handleFile(req, file, cb) {
    // Generate a unique filename for the GCS object, including a folder prefix for organization.
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const gcsFileName = `plan_files/plan-${baseName}-${uniqueSuffix}${ext}`;

    const gcsFile = bucket.file(gcsFileName);

    // Create a writable stream to the GCS object.
    const stream = gcsFile.createWriteStream({
      resumable: false, // Set to true for large files if network is unreliable
      contentType: file.mimetype,
    });

    // Pipe the file data from the request into the GCS stream.
    file.stream
      .pipe(stream)
      .on('error', (err) => {
        cb(err);
      })
      .on('finish', () => {
        // On successful upload, pass GCS file details to the next middleware via req.file.
        // A signed URL for client access can be generated later in the request lifecycle if needed.
        cb(null, {
          bucket: bucket.name,
          path: gcsFileName,
          filename: gcsFileName,
          gcsUrl: `gs://${bucket.name}/${gcsFileName}`,
        });
      });
  }

  /**
   * Removes the file from GCS. Multer calls this if an error occurs later
   * in the request pipeline, providing a cleanup/rollback mechanism.
   * @param {import('express').Request} req - The Express request object.
   * @param {Express.Multer.File & { path: string }} file - The file object, containing the GCS path.
   * @param {function(Error | null): void} cb - The callback function.
   */
  _removeFile(req, file, cb) {
    const gcsFile = bucket.file(file.path);
    // Use ignoreNotFound to prevent errors if the file was never created or already deleted.
    gcsFile.delete({ ignoreNotFound: true }).then(() => cb(null)).catch(err => cb(err));
  }
}

/**
 * Configures Multer's storage engine to use the custom GCS streamer.
 * @type {GcsStorage}
 */
const storage = new GcsStorage();

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
 * It uses the custom GCS storage engine, the file filter, and applies a file size limit.
 * This middleware can be used in Express routes to handle `multipart/form-data` and
 * stream file uploads directly to Google Cloud Storage.
 * @type {multer.Multer}
 */
export const uploadPlanFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: PLAN_GENERATOR_CONFIG.MAX_FILE_SIZE,
  },
});