import multer from 'multer';
import path from 'path';
import { GCSStorageEngine } from './uploder.js';

const audioUploader = multer({
  storage: new GCSStorageEngine({ folder: 'audio_uploads' }),
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|m4a|wav|webm|flac|ogg|mpga|mp4|mpeg)$/i;
    if (!allowed.test(file.originalname)) {
      return cb(new Error('Unsupported file format'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

export default audioUploader;
