import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DOCUMENT_REVIEW_CONFIG, STORAGE_CONFIG } from '../document_review.constant.js';

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
    cb(null, `review-${uniqueSuffix}${ext}`);
  },
});

// File filter
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

// Create multer upload instance
export const uploadDocumentReview = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_REVIEW_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadDocumentReview;
