import multer from 'multer';
import path from 'path';
import fs from 'fs';

const tempDir = path.join(process.cwd(), 'uploads', 'audio_temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const audioUploader = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|m4a|wav|webm|flac|ogg|opus|aac|mpga|mp4|mpeg)$/i;
    if (!allowed.test(file.originalname)) {
      return cb(new Error('Unsupported audio format. Allowed: mp3, m4a, wav, webm, flac, ogg, opus, aac'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB max (Together.ai binary audio upload limit)
});

export default audioUploader;
