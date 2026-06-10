/**
 * @file This module configures Multer for handling article file uploads.
 * It sets up storage, file naming conventions, and file type filtering for various document formats.
 * The uploaded files are stored in a designated directory, with subdirectories for each user to ensure data isolation.
 * @module middlewares/uploadArticleFile
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
// OPTIMIZATION: Import the promises API from the 'fs' module to perform non-blocking file system operations.
// This is crucial for avoiding event loop blockage in a Node.js environment.
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'url';

// Safely determine the current directory path, compatible with both ES Modules and CommonJS.
// This is necessary because `__dirname` is not available in ES Modules by default.
let currentDir;
try {
  // @ts-ignore - __dirname is not defined in ESM scope
  currentDir = __dirname;
} catch (e) {
  currentDir = path.dirname(fileURLToPath(import.meta.url));
}

/**
 * The absolute path to the base directory where uploaded article files will be stored.
 * If the directory does not exist, it will be created recursively upon server startup.
 * The path is resolved from the current file's location to ensure consistency.
 * @constant
 * @type {string}
 */
const uploadDir = path.join(currentDir, '..', '..', '..', '..', '..', 'uploads', 'article_files');

// Ensure the base upload directory exists synchronously on application start.
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Asynchronously calculates the total size of all files within a given directory.
 * OPTIMIZATION: This function is now asynchronous to prevent blocking the Node.js event loop.
 * The original synchronous version could cause significant performance degradation by blocking
 * the server from handling other requests while reading a directory with many files.
 * This version uses `fs.promises` for non-blocking I/O.
 * @param {string} dirPath - The absolute path to the directory.
 * @returns {Promise<number>} A promise that resolves to the total size of all files in the directory, in bytes. Returns 0 if the directory doesn't exist.
 */
const getDirSizeAsync = async (dirPath) => {
  try {
    const files = await fsPromises.readdir(dirPath);
    // Process all file stats in parallel for maximum efficiency.
    const statsPromises = files.map((file) => {
      const filePath = path.join(dirPath, file);
      // Gracefully handle cases where a file cannot be accessed (e.g., permissions).
      return fsPromises.stat(filePath).catch(() => null);
    });

    const statsArray = await Promise.all(statsPromises);

    // Sum the sizes of all valid files.
    const totalSize = statsArray.reduce((acc, stats) => {
      if (stats && stats.isFile()) {
        return acc + stats.size;
      }
      return acc;
    }, 0);

    return totalSize;
  } catch (err) {
    // If the directory doesn't exist, it's not an error; its size is 0.
    if (err.code === 'ENOENT') {
      return 0;
    }
    // For other errors, propagate them up.
    throw err;
  }
};

/**
 * Multer disk storage configuration.
 * This engine provides full control over storing files to disk, including destination and filename generation.
 * @type {import('multer').StorageEngine}
 */
const storage = multer.diskStorage({
  /**
   * Determines the destination directory for an uploaded file.
   * This function implements multi-tenancy by creating a unique subdirectory for each user
   * based on their user ID, which is sanitized to prevent path traversal issues.
   * It also enforces a storage quota for each user. If the user's current storage usage
   * is at or exceeds their `maxStorageLimit` (or a system default of 100MB), the upload is rejected.
   *
   * @param {import('express').Request} req - The Express request object. It is expected to have a `user` property attached by an authentication middleware.
   * @param {Express.Multer.File} file - The file object being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function. Called with an error if storage limit is exceeded, or with the destination path on success.
   */
  destination: function (req, file, cb) {
    const rawUserId = req.user?.id || req.user?._id || req.userId || 'anonymous';
    const safeUserId = String(rawUserId).replace(/[^a-zA-Z0-9-_]/g, '') || 'anonymous';
    const userUploadDir = path.join(uploadDir, safeUserId);

    // OPTIMIZATION: Use an async IIFE (Immediately Invoked Function Expression) to perform non-blocking I/O.
    // The original implementation used synchronous fs calls (e.g., fs.mkdirSync, fs.readdirSync, fs.statSync)
    // which block the Node.js event loop. This is especially problematic when calculating directory size for users
    // with many files, as it can freeze the entire server. This updated version uses async/await with fs.promises.
    (async () => {
      try {
        // Asynchronously ensure the user's upload directory exists.
        await fsPromises.mkdir(userUploadDir, { recursive: true });

        // Enforce user-level storage limit (default 100MB, or custom user limit if specified)
        const userMaxStorage = req.user?.maxStorageLimit || 100 * 1024 * 1024; // 100MB

        // Asynchronously calculate the current directory size without blocking the event loop.
        const currentStorageSize = await getDirSizeAsync(userUploadDir);

        // Note: `file.size` is not available in the `destination` function.
        // This check prevents new uploads if the user is already at or over their limit.
        if (currentStorageSize >= userMaxStorage) {
          return cb(new Error('User storage limit exceeded. Please delete some files before uploading more.'));
        }

        // If all checks pass, signal success to multer with the destination path.
        cb(null, userUploadDir);
      } catch (err) {
        // In case of an error, pass it to multer's callback.
        cb(err);
      }
    })();
  },
  /**
   * Defines the filename for uploaded files.
   * To avoid naming conflicts, each file is given a unique name composed of a prefix,
   * the current timestamp, and a random number, while preserving its original extension.
   * @param {import('express').Request} req - The Express request object.
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
 * Filters incoming files to ensure they are of a supported document type.
 * It checks the file's extension against a predefined list of allowed formats.
 * If the file extension is not in the allowed list, the upload is rejected with an error.
 * The check is case-insensitive.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file object being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function. Called with an error for unsupported types, or with `(null, true)` to accept the file.
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
 * An configured instance of Multer middleware for handling single article file uploads.
 *
 * This middleware integrates the custom disk storage engine and file filter.
 * It is pre-configured with the following settings:
 * - **Storage**: Uses the `storage` engine to save files in user-specific directories with unique names.
 * - **File Filter**: Uses `fileFilter` to allow only specific document extensions.
 * - **Limits**: Sets a maximum file size of 10MB per upload.
 *
 * @example
 * // Usage in an Express route:
 * import { uploadArticleFile } from './uploadArticleFile.js';
 *
 * router.post('/upload', uploadArticleFile.single('articleFile'), (req, res) => {
 *   // req.file is the 'articleFile' file
 *   // req.body will hold the text fields, if there were any
 *   res.send({ message: 'File uploaded successfully!', file: req.file });
 * });
 *
 * @type {import('multer').Multer}
 */
export const uploadArticleFile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

/**
 * Default export of the configured Multer instance.
 * This allows for flexible importing styles.
 * @see {@link uploadArticleFile} for configuration details and usage.
 * @type {import('multer').Multer}
 */
export default uploadArticleFile;