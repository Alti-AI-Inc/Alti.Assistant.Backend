import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DOCUMENT_ANALYSIS_CONFIG } from '../document_analysis.constant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create upload directory if it doesn't exist
const uploadDir = path.join(__dirname, '../../../../../uploads/document_analysis');
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
    cb(null, `analysis-${uniqueSuffix}${ext}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type. Supported types: ${DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

// Create multer instance
export const uploadDocumentAnalysis = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: DOCUMENT_ANALYSIS_CONFIG.MAX_FILE_SIZE,
  },
});
