import multer from 'multer';
import path from 'path';
import {
  LEGAL_CONTRACT_REVIEW_CONFIG,
} from '../legal_contract_review.constant.js';
import { GCSStorageEngine } from '../../../../app/middlewares/uploder/uploder.js';

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
  storage: new GCSStorageEngine({ folder: 'legal_contract_review' }),
  fileFilter: fileFilter,
  limits: {
    fileSize: LEGAL_CONTRACT_REVIEW_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadLegalContractReview;
