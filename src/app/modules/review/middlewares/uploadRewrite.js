import multer from 'multer';
import path from 'path';
import { GCSStorageEngine } from '../../../../app/middlewares/uploder/uploder.js';
import { REWRITE_CONFIG } from '../review.constant.js';

/**
 * @typedef {import('express').Request} Express.Request
 * @typedef {import('express').Response} Express.Response
 * @typedef {import('express').NextFunction} Express.NextFunction
 * @typedef {import('multer').File} Express.Multer.File
 */

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
  storage: new GCSStorageEngine({ folder: 'rewrite' }),
  fileFilter: fileFilter,
  limits: {
    fileSize: REWRITE_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadRewrite;
