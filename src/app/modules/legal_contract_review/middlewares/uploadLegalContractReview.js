import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  LEGAL_CONTRACT_REVIEW_CONFIG,
  STORAGE_CONFIG,
} from '../legal_contract_review.constant.js';

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
    cb(null, `contract-review-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (LEGAL_CONTRACT_REVIEW_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${LEGAL_CONTRACT_REVIEW_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

// Create multer upload instance
export const uploadLegalContractReview = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: LEGAL_CONTRACT_REVIEW_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadLegalContractReview;
