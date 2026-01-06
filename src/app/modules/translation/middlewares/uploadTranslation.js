import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { FILE_SIZE_LIMITS, STORAGE_CONFIG, SUPPORTED_DOCUMENT_FORMATS } from '../translation.constant.js';

// Ensure upload directory exists
const uploadDir = STORAGE_CONFIG.TEMP_FOLDER;
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
    cb(null, `translation-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (SUPPORTED_DOCUMENT_FORMATS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${SUPPORTED_DOCUMENT_FORMATS.join(', ')}`
      ),
      false
    );
  }
};

// Create multer upload instance
export const uploadTranslation = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMITS.MAX_FILE_SIZE,
  },
});

export default uploadTranslation;
