import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { LEGAL_CONTRACT_CONFIG } from '../legal_contract.constant.js';

/**
 * @const {string} __filename
 * @description The absolute path to the current module file.
 * @private
 */
const __filename = fileURLToPath(import.meta.url);

/**
 * @const {string} __dirname
 * @description The absolute path to the directory containing the current module file.
 * @private
 */
const __dirname = path.dirname(__filename);

/**
 * @const {string} uploadDir
 * @description The absolute path to the directory where legal contract files will be uploaded.
 * It is constructed relative to the project's root `uploads` directory.
 */
const uploadDir = path.join(
  __dirname,
  '../../../../../uploads/legal_contracts'
);

/**
 * @description Ensures that the upload directory exists. If it doesn't, it's created recursively.
 */
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * @const {multer.StorageEngine} storage
 * @description Configures the storage engine for multer. It specifies how files are stored on disk.
 * @property {function(req, file, cb)} destination - Determines the destination directory for uploaded files.
 * @property {function(req, file, cb)} filename - Determines the filename for uploaded files, ensuring uniqueness by appending a timestamp and a random number to the original filename.
 */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`);
  },
});

/**
 * @const {function(import('express').Request, Express.Multer.File, multer.FileFilterCallback)} fileFilter
 * @description A multer filter function to validate incoming files.
 * It checks if the file's extension and MIME type are among the supported types defined in `LEGAL_CONTRACT_CONFIG`.
 * If the file is invalid, it passes an error to the callback, which rejects the file upload.
 * @param {import('express').Request} req - The Express request object.
 * @param {Express.Multer.File} file - The file being uploaded.
 * @param {multer.FileFilterCallback} cb - The callback to signal whether to accept the file.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check file extension
  if (!LEGAL_CONTRACT_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    return cb(
      new Error(
        `Invalid file type. Supported formats: ${LEGAL_CONTRACT_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }

  // Check MIME type
  if (!LEGAL_CONTRACT_CONFIG.SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid MIME type. Supported types: ${LEGAL_CONTRACT_CONFIG.SUPPORTED_MIME_TYPES.join(', ')}`
      ),
      false
    );
  }

  cb(null, true);
};

/**
 * @const {import('multer').Multer} uploadLegalContract
 * @description A configured multer instance for handling legal contract file uploads.
 * It uses the defined `storage` and `fileFilter`, and sets a file size limit based on `LEGAL_CONTRACT_CONFIG`.
 * This middleware should be used in routes that require legal contract file uploads.
 *
 * @example
 * // Usage in an Express route for a single file upload:
 * // router.post('/upload', uploadLegalContract.single('contract'), (req, res) => { ... });
 *
 * @security
 * Role-based access control should be implemented in the route that uses this middleware
 * to ensure only authorized users can upload files.
 *
 * @multi-tenant
 * If the application is multi-tenant, the `destination` function within the `storage` configuration
 * could be modified to include a tenant-specific identifier in the path (e.g., from `req.user.tenantId`)
 * to isolate tenant data.
 */
export const uploadLegalContract = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: LEGAL_CONTRACT_CONFIG.MAX_FILE_SIZE,
  },
});

/**
 * @function handleUploadError
 * @description An Express error-handling middleware specifically for multer-related errors.
 * It catches `MulterError` instances (e.g., file size limit exceeded) and other upload-related errors
 * from the `fileFilter`, sending a standardized JSON error response to the client.
 * This should be placed in the middleware chain after any routes that use the `uploadLegalContract` middleware.
 * @param {Error | import('multer').MulterError} err - The error object.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 * @returns {void | import('express').Response} Sends a JSON response or calls the next middleware if the error is not from multer.
 */
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is ${LEGAL_CONTRACT_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    // Catches errors from the fileFilter
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
};