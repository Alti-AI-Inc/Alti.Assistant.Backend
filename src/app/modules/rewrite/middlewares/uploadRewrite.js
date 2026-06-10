import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { REWRITE_CONFIG, STORAGE_CONFIG } from '../rewrite.constant.js';

/**
 * @typedef {import('express').Request} Express.Request
 * @typedef {import('express').Response} Express.Response
 * @typedef {import('express').NextFunction} Express.NextFunction
 * @typedef {import('multer').File} Express.Multer.File
 */

/**
 * The directory where temporary files will be uploaded.
 * This path is derived from `STORAGE_CONFIG.TEMP_FOLDER`.
 * The directory is created if it does not already exist.
 * @type {string}
 */
const uploadDir = STORAGE_CONFIG.TEMP_FOLDER;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configures the storage for Multer, specifying the destination and filename generation logic.
 * Files will be stored on disk in the `uploadDir`.
 * @type {multer.StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Sets the destination directory for uploaded files.
   * @param {Express.Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file object being uploaded.
   * @param {function(Error|null, string): void} cb - The callback function to set the destination.
   * @returns {void}
   */
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  /**
   * Generates a unique filename for the uploaded file.
   * The filename will be prefixed with 'rewrite-' followed by a unique suffix
   * (timestamp + random number) and the original file extension.
   * @param {Express.Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file object being uploaded.
   * @param {function(Error|null, string): void} cb - The callback function to set the filename.
   * @returns {void}
   */
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `rewrite-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filters files based on their extension.
 * Only file types specified in `REWRITE_CONFIG.SUPPORTED_FILE_EXTENSIONS` are allowed.
 * @param {Express.Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file object being uploaded.
 * @param {function(Error|null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (REWRITE_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${REWRITE_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

/**
 * Multer instance configured for handling file uploads related to the rewrite module.
 * It uses disk storage, applies a file type filter, and enforces a maximum file size.
 * @type {multer.Multer}
 */
export const uploadRewrite = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: REWRITE_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadRewrite;