import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ApiError from '../../../../errors/ApiError.js';
import { PLAN_GENERATOR_CONFIG } from '../plan_generator.constant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), 'uploads', 'plan_files');
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
    const baseName = path.basename(file.originalname, ext);
    cb(null, `plan-${baseName}-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!PLAN_GENERATOR_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    return cb(
      new ApiError(
        400,
        `Invalid file type. Supported formats: ${PLAN_GENERATOR_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }

  if (!PLAN_GENERATOR_CONFIG.SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new ApiError(
        400,
        `Invalid file MIME type. Supported types: ${PLAN_GENERATOR_CONFIG.SUPPORTED_MIME_TYPES.join(', ')}`
      ),
      false
    );
  }

  cb(null, true);
};

// Configure multer
export const uploadPlanFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: PLAN_GENERATOR_CONFIG.MAX_FILE_SIZE,
  },
});
