/**
 * @file This module configures Multer for handling article file uploads.
 * It sets up storage, file naming conventions, and file type filtering for various document formats.
 * The uploaded files are stored in a designated directory.
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';

/**
 * The directory where uploaded article files will be stored.
 * If the directory does not exist, it will be created recursively.
 * @type {string}
 */
const uploadDir = 'uploads/article_files';

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Configures the storage settings for Multer.
 * Files are stored on disk with a unique name in the `uploadDir`.
 * @type {multer.StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Defines the destination directory for uploaded files.
   * @param {Express.Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the destination.
   */
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  /**
   * Defines the filename for uploaded files.
   * Each file gets a unique name based on a timestamp and random number,
   * preserving its original extension.
   * @param {Express.Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the filename.
   */
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `article-${uniqueSuffix}${ext}`);
  },
});

/**
 * Filters incoming files based on their extension.
 * Only specific document types (PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, PPT) are allowed.
 * @param {Express.Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function to indicate if the file should be accepted.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const supportedExtensions = [
    '.pdf',
    '.docx',
    '.doc',
    '.txt',
    '.xlsx',
    '.xls',
    '.pptx',
    '.ppt',
  ];

  if (supportedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${supportedExtensions.join(', ')}`
      ),
      false
    );
  }
};

/**
 * Multer instance configured for uploading article files.
 * It uses the defined `storage` and `fileFilter`, and sets a file size limit of 10MB.
 * This middleware can be used in Express routes to handle `multipart/form-data` file uploads.
 * @type {multer.Multer}
 */
export const uploadArticleFile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * Default export for the Multer instance configured for article file uploads.
 * @type {multer.Multer}
 */
export default uploadArticleFile;