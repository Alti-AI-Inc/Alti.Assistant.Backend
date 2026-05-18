import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_INPUT_FORMATS,
  FILE_SIZE_LIMITS,
  MAX_FILES_PER_REQUEST,
} from '../report.constant.js';

// Ensure upload directory exists
const uploadDir = 'uploads/reports';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);

  if (!SUPPORTED_INPUT_FORMATS.includes(ext)) {
    logger.warn(`Rejected file with unsupported format: ${ext}`);
    return cb(
      new Error(
        `File format .${ext} is not supported. Allowed formats: ${SUPPORTED_INPUT_FORMATS.join(', ')}`
      ),
      false
    );
  }

  cb(null, true);
};

// Get size limit based on file extension
const getSizeLimit = (filename) => {
  const ext = path.extname(filename).toLowerCase().substring(1).toUpperCase();
  return FILE_SIZE_LIMITS[ext] || FILE_SIZE_LIMITS.DEFAULT;
};

// Configure multer
const reportFileUploader = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: Math.max(...Object.values(FILE_SIZE_LIMITS)), // Use maximum limit
    files: MAX_FILES_PER_REQUEST,
  },
}).array('files', MAX_FILES_PER_REQUEST);

// Middleware wrapper with error handling
export const uploadReportFiles = (req, res, next) => {
  reportFileUploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      logger.error('Multer error:', err);

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File size exceeds maximum allowed size`,
          error: err.message,
        });
      }

      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: `Maximum ${MAX_FILES_PER_REQUEST} files allowed`,
          error: err.message,
        });
      }

      return res.status(400).json({
        success: false,
        message: 'File upload error',
        error: err.message,
      });
    } else if (err) {
      logger.error('Upload error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'Unknown upload error',
      });
    }

    // Validate individual file sizes based on their format
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const sizeLimit = getSizeLimit(file.originalname);
        if (file.size > sizeLimit) {
          // Clean up uploaded files
          req.files.forEach((f) => {
            if (fs.existsSync(f.path)) {
              fs.unlinkSync(f.path);
            }
          });

          return res.status(400).json({
            success: false,
            message: `File ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum size for its format (${(sizeLimit / 1024 / 1024).toFixed(2)}MB)`,
          });
        }
      }

      logger.info(`Uploaded ${req.files.length} file(s) successfully`);
    }

    next();
  });
};

// Cleanup uploaded files
export const cleanupUploadedFiles = (files) => {
  if (!files || !Array.isArray(files)) {
    return;
  }

  files.forEach((file) => {
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        logger.info(`Cleaned up file: ${file.path}`);
      }
    } catch (error) {
      logger.error(`Error cleaning up file ${file.path}:`, error);
    }
  });
};

export default uploadReportFiles;
