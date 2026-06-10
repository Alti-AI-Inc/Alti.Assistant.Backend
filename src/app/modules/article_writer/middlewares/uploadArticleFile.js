/**
 * @file This module configures Multer for handling article file uploads.
 * It sets up storage, file naming conventions, and file type filtering for various document formats.
 * The uploaded files are stored in a designated directory, with subdirectories for each workspace and user to ensure data isolation and respect tenant boundaries.
 * @module middlewares/uploadArticleFile
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
// PERFORMANCE OPTIMIZATION: Import fs.promises for non-blocking file system operations.
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

// Ensure the base upload directory exists synchronously on application start. This is acceptable
// as it runs only once and not during a request-response cycle.
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Asynchronously and recursively calculates the total size of all files within a given directory.
 * This is a helper function used to enforce workspace-level storage quotas before an upload.
 * It iterates through directory contents and sums the size of each file,
 * silently ignoring any subdirectories or files that cannot be accessed.
 * This non-blocking version prevents the event loop from being stalled during I/O operations.
 * @param {string} dirPath - The absolute path to the directory.
 * @returns {Promise<number>} A promise that resolves to the total size of all files in the directory, in bytes. Returns 0 if the directory doesn't exist.
 */
const getDirSizeAsync = async (dirPath) => {
  try {
    const items = await fsPromises.readdir(dirPath);
    const sizes = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(dirPath, item);
        try {
          const stats = await fsPromises.stat(itemPath);
          if (stats.isFile()) {
            return stats.size;
          }
          if (stats.isDirectory()) {
            // Recursively calculate size of subdirectory.
            return await getDirSizeAsync(itemPath);
          }
        } catch (err) {
          // Ignore files/directories that cannot be read (e.g., due to permissions).
          console.error(`Could not read stats for ${itemPath}:`, err);
          return 0;
        }
        return 0;
      })
    );
    return sizes.reduce((acc, size) => acc + size, 0);
  } catch (err) {
    // If the directory doesn't exist, readdir will throw an ENOENT error. This is not a failure, just means size is 0.
    if (err.code === 'ENOENT') {
      return 0;
    }
    // For other errors, re-throw to be caught by the caller.
    console.error(`Error calculating directory size for ${dirPath}:`, err);
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
   * within their workspace's directory. This ensures data is correctly namespaced and isolated.
   * The workspace and user IDs are sanitized to prevent path traversal vulnerabilities.
   *
   * @param {import('express').Request} req - The Express request object. It is expected to have a `user` property with `id`, `workspaceId` attached by an authentication middleware.
   * @param {Express.Multer.File} file - The file object being uploaded.
   * @param {function(Error | null, string): void} cb - The callback function. Called with an error on filesystem issues, or with the destination path on success.
   */
  destination: async function (req, file, cb) {
    // INTEGRATION FIX: Switched from user-only directory to a workspace/tenant-based structure.
    // This ensures that all files for a given workspace are stored together, respecting tenant boundaries.
    if (!req.user?.workspaceId) {
      const err = new Error('User is not associated with a workspace.');
      // @ts-ignore
      err.statusCode = 403;
      return cb(err);
    }
    const rawWorkspaceId = req.user.workspaceId;
    const safeWorkspaceId = String(rawWorkspaceId).replace(/[^a-zA-Z0-9-_]/g, '') || 'invalid_workspace';

    const rawUserId = req.user?.id || req.user?._id;
    const safeUserId = String(rawUserId).replace(/[^a-zA-Z0-9-_]/g, '') || 'invalid_user';

    // Store files in a user-specific folder within the workspace directory for better organization and traceability.
    const userUploadDir = path.join(uploadDir, safeWorkspaceId, safeUserId);

    try {
      // PERFORMANCE OPTIMIZATION: Switched from synchronous fs.mkdirSync to asynchronous fsPromises.mkdir.
      // This prevents blocking the Node.js event loop during file system operations, improving server responsiveness under load.
      await fsPromises.mkdir(userUploadDir, { recursive: true });
      cb(null, userUploadDir);
    } catch (err) {
      console.error('Failed to create upload directory:', err);
      const error = new Error('Could not create storage directory.');
      // @ts-ignore
      error.statusCode = 500;
      cb(error);
    }
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
 * Filters incoming files based on role, file type, and workspace storage quotas.
 * This function is the primary gatekeeper for uploads, ensuring all business and security rules are met before a file is accepted.
 *
 * @param {import('express').Request} req - The Express request object, expected to contain `req.user` with role and workspace info.
 * @param {Express.Multer.File} file - The file object being uploaded.
 * @param {function(Error | null, boolean): void} cb - The callback function. Called with an error to reject the file, or with `(null, true)` to accept it.
 */
const fileFilter = async (req, file, cb) => {
  try {
    // INTEGRATION: Role and authentication validation.
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

    // INTEGRATION: Tenant context validation. User must belong to a workspace.
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

    // INTEGRATION & BUG FIX: Enforce workspace-level storage limit, not user-level.
    // This correctly propagates usage to the workspace/tenant level.
    // The check now includes the size of the incoming file to prevent exceeding the quota.
    const rawWorkspaceId = user.workspaceId;
    const safeWorkspaceId = String(rawWorkspaceId).replace(/[^a-zA-Z0-9-_]/g, '');
    const workspaceUploadDir = path.join(uploadDir, safeWorkspaceId);

    // Super admins can bypass storage limits.
    if (user.role === 'super_admin') {
      return cb(null, true);
    }

    // Default workspace limit is 500MB, can be overridden by workspace-specific settings from the user object.
    const workspaceMaxStorage = user.workspace?.maxStorageLimit || 500 * 1024 * 1024; // 500MB

    // PERFORMANCE OPTIMIZATION: Replaced a synchronous, blocking directory size calculation with an asynchronous version.
    // The original implementation would block the entire Node.js event loop while scanning the file system,
    // causing all other concurrent requests to hang. This async approach ensures the server remains responsive
    // during the I/O-intensive size check.
    const currentWorkspaceStorageSize = await getDirSizeAsync(workspaceUploadDir);
    const incomingFileSize = file.size;

    if (currentWorkspaceStorageSize + incomingFileSize > workspaceMaxStorage) {
      const err = new Error('Uploading this file would exceed your workspace storage limit. Please contact your administrator.');
      // @ts-ignore
      err.statusCode = 413; // Payload Too Large
      return cb(err, false);
    }

    // If all checks pass, accept the file.
    cb(null, true);
  } catch (err) {
    console.error('Error in multer fileFilter:', err);
    // Ensure a proper error object is passed to the callback for multer to handle.
    if (err.statusCode) {
      return cb(err);
    }
    const error = new Error('An unexpected error occurred during file validation.');
    // @ts-ignore
    error.statusCode = 500;
    cb(error);
  }
};

/**
 * An configured instance of Multer middleware for handling single article file uploads.
 *
 * This middleware integrates the custom disk storage engine and file filter.
 * It is pre-configured with the following settings:
 * - **Storage**: Uses the `storage` engine to save files in workspace/user-specific directories.
 * - **File Filter**: Uses `fileFilter` to validate user role, file type, and workspace storage quotas.
 * - **Limits**: Sets a maximum file size of 25MB per upload.
 *
 * @example
 * // Usage in an Express route:
 * import { uploadArticleFile } from './uploadArticleFile.js';
 * import { authMiddleware } from '../auth/authMiddleware.js'; // Example auth middleware
 *
 * router.post('/upload', authMiddleware, uploadArticleFile.single('articleFile'), (req, res) => {
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
    fileSize: 25 * 1024 * 1024, // 25MB file size limit
  },
});

/**
 * Default export of the configured Multer instance.
 * This allows for flexible importing styles.
 * @see {@link uploadArticleFile} for configuration details and usage.
 * @type {import('multer').Multer}
 */
export default uploadArticleFile;