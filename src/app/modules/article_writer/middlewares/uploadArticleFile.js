/**
 * @file This module configures Multer for handling article file uploads.
 * It sets up storage, file naming conventions, and file type filtering for various document formats.
 * The uploaded files are stored in a designated directory.
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Safely determine current directory in both ESM and CommonJS environments
let currentDir;
try {
  currentDir = __dirname;
} catch (e) {
  currentDir = path.dirname(fileURLToPath(import.meta.url));
}

/**
 * The directory where uploaded article files will be stored.
 * If the directory does not exist, it will be created recursively.
 * Using an absolute path ensures consistent behavior regardless of the application's current working directory.
 * The path is resolved relative to the project root (Alti.Assistant.Backend).
 * @type {string}
 */
const uploadDir = path.join(currentDir, '..', '..', '..', '..', '..', 'uploads', 'article_files');

// Ensure base upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Helper function to calculate the total size of a directory's files.
 * Helps enforce user-level storage limits.
 * @param {string} dirPath - Path to the directory.
 * @returns {number} - Total size in bytes.
 */
const getDirSize = (dirPath) => {
  let size = 0;
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          size += stats.size;
        }
      } catch (err) {
        // Ignore files that cannot be read
      }
    }
  }
  return size;
};

/**
 * Configures the storage settings for Multer.
 * Files are stored on disk with a unique name in the user-specific subdirectory of `uploadDir`.
 * @type {multer.StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Defines the destination directory for uploaded files.
   * Isolates user data by creating a user-specific subdirectory.
   * Respects user-level storage limits.
   * @param {Express.Request} req - The Express request object.
   * @param {Express.Multer.File} file - The file being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function to set the destination.
   */
  destination: function (req, file, cb) {
    const rawUserId = req.user?.id || req.user?._id || req.userId || 'anonymous';
    const safeUserId = String(rawUserId).replace(/[^a-zA-Z0-9-_]/g, '') || 'anonymous';
    const userUploadDir = path.join(uploadDir, safeUserId);

    try {
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }

      // Enforce user-level storage limit (default 100MB, or custom user limit if specified)
      const userMaxStorage = req.user?.maxStorageLimit || 100 * 1024 * 1024; // 100MB
      const currentStorageSize = getDirSize(userUploadDir);

      if (currentStorageSize >= userMaxStorage) {
        return cb(new Error('User storage limit exceeded. Please delete some files before uploading more.'));
      }

      cb(null, userUploadDir);
    } catch (err) {
      cb(err);
    }
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