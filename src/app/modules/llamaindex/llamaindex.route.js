import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { queryIndex, uploadAndIndexDocument } from './llamaindex.controller.js';

const router = express.Router();

const uploadDir = path.resolve('uploads/ragsystem');

// Ensure the folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024, // ⬅️ 1 MB = 1 * 1024 * 1024 bytes
  },
});

router.post('/index-doc', upload.array('files', 3), uploadAndIndexDocument);
router.post('/query', queryIndex);

export const llamaindexRoutes = router;
