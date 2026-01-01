import multer from 'multer';
import path from 'path';
import { KNOWLEDGE_CONFIG } from '../knowledge.constant.js';

// Configure storage - use memory storage to keep file in buffer
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (KNOWLEDGE_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not supported. Allowed types: ${KNOWLEDGE_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }
};

// Create multer upload instance
export const uploadKnowledge = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: KNOWLEDGE_CONFIG.MAX_FILE_SIZE,
  },
});

export default uploadKnowledge;
