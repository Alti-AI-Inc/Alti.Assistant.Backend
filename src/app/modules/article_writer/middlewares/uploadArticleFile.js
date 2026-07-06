/**
 * @file This module configures Multer for handling article file uploads.
 * It uses GCSStorageEngine to stream files directly to Google Cloud Storage.
 * @module middlewares/uploadArticleFile
 */

import multer from 'multer';
import path from 'path';
import { GCSStorageEngine } from '../../middlewares/uploder/uploder.js';

/**
 * Filters incoming files based on role and file type.
 * Storage limits are handled by the checkStorageLimit middleware.
 */
const fileFilter = async (req, file, cb) => {
  try {
    const user = req.user;
    if (!user) {
      const err = new Error('Authentication required to upload files.');
      // @ts-ignore
      err.statusCode = 401;
      return cb(err, false);
    }
    const allowedRoles = ['user', 'manager', 'admin', 'super_admin'];
    if (!user.role || !allowedRoles.includes(user.role)) {
      const err = new Error('You do not have permission to upload files.');
      // @ts-ignore
      err.statusCode = 403;
      return cb(err, false);
    }

    if (!user.workspaceId) {
      const err = new Error('User is not associated with a workspace.');
      // @ts-ignore
      err.statusCode = 403;
      return cb(err, false);
    }

    // 1. Check file type
    const ext = path.extname(file.originalname).toLowerCase();
    const supportedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.xlsx', '.xls', '.pptx', '.ppt'];
    if (!supportedExtensions.includes(ext)) {
      const err = new Error(`File type not supported. Allowed types: ${supportedExtensions.join(', ')}`);
      // @ts-ignore
      err.statusCode = 400;
      return cb(err, false);
    }

    cb(null, true);
  } catch (err) {
    console.error('Error in multer fileFilter:', err);
    if (err.statusCode) {
      return cb(err);
    }
    const error = new Error('An unexpected error occurred during file validation.');
    // @ts-ignore
    error.statusCode = 500;
    cb(error);
  }
};

export const uploadArticleFile = multer({
  storage: new GCSStorageEngine({ folder: 'article_files' }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB file size limit
  },
});

export default uploadArticleFile;