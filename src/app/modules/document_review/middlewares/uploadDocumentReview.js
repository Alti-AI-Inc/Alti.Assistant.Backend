import multer from 'multer';
import path from 'path';
import {
  DOCUMENT_REVIEW_CONFIG,
} from '../document_review.constant.js';
import { GCSStorageEngine } from '../../../../app/middlewares/uploder/uploder.js';

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
  storage: new GCSStorageEngine({ folder: 'document_review' }),
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_REVIEW_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadDocumentReview;