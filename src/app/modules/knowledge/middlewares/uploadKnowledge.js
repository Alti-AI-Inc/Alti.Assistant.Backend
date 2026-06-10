/**
 * @file Middleware for handling knowledge base file uploads using Multer.
 * @module app/modules/knowledge/middlewares/uploadKnowledge
 * @author Your Name/Organization
 */

import multer from 'multer';
import path from 'path';
import { KNOWLEDGE_CONFIG } from '../knowledge.constant.js';

/**
 * Configures Multer storage.
 * Uses memory storage to keep the file in a buffer, making it accessible via `req.file.buffer`.
 * This is suitable for processing files directly in memory without saving them to disk.
 * @type {multer.StorageEngine}
 */
const storage = multer.memoryStorage();

/**
 * Multer file filter function to restrict file types.
 * It checks if the uploaded file's extension is included in the list of
 * supported extensions defined in `KNOWLEDGE_CONFIG.SUPPORTED_FILE_EXTENSIONS`.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file object provided by Multer.
 * @param {(error: Error | null, acceptFile: boolean) => void} cb - The callback function to signal acceptance or rejection.
 *   - `cb(null, true)` to accept the file.
 *   - `cb(new Error('message'), false)` to reject the file with an error message.
 * @returns {void}
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (KNOWLEDGE_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${KNOWLEDGE_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

/**
 * Multer instance configured for knowledge base file uploads.
 * This middleware handles single file uploads, storing them in memory,
 * filtering by allowed file extensions, and enforcing a maximum file size.
 *
 * @type {multer.Multer}
 * @property {multer.StorageEngine} storage - The storage engine used (memoryStorage).
 * @property {(req: import('express').Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => void} fileFilter - The function used to filter incoming files.
 * @property {object} limits - Limits for the uploaded data.
 * @property {number} limits.fileSize - The maximum file size allowed, in bytes, as defined in `KNOWLEDGE_CONFIG.MAX_FILE_SIZE`.
 */
export const uploadKnowledge = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: KNOWLEDGE_CONFIG.MAX_FILE_SIZE,
  },
});

/**
 * Default export for the configured Multer upload middleware.
 * Use this middleware in your routes to handle single file uploads for knowledge base documents.
 * @type {multer.Multer}
 */
export default uploadKnowledge;