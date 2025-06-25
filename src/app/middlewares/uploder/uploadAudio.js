// import aws from 'aws-sdk';
// import multerS3 from 'multer-s3';
// import { fileURLToPath } from 'url';
// import config from '../../../../config/index.js';
import multer from 'multer';
import path from 'path';

// // Needed to resolve __dirname in ES module
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// const audioUploader = options => {
//   const {
//     folder,
//     acl,
//     supportedExtensions = /\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i,
//     maxFileSize = 10 * 1024 * 1024,
//   } = options;

//   const spacesEndpoint = new aws.Endpoint('nyc3.digitaloceanspaces.com');

//   const s3 = new aws.S3({
//     accessKeyId: config.cloud_storage_access_key,
//     secretAccessKey: config.cloud_storage_secret_key,
//     endpoint: spacesEndpoint,
//   });

//   const storage = multerS3({
//     s3,
//     bucket: config.cloud_storage_bucket,
//     acl,
//     key: (req, file, cb) => {
//       const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//       const key = `${folder}/${uniqueSuffix}-${file.originalname}`;
//       cb(null, key);
//     },
//     contentType: multerS3.AUTO_CONTENT_TYPE,
//   });

//   return multer({
//     storage,
//     fileFilter: (req, file, cb) => {
//       const extension = path.extname(file.originalname);
//       if (supportedExtensions.test(extension)) {
//         cb(null, true);
//       } else {
//         cb(new Error(`Only audio files are allowed: ${supportedExtensions}`));
//       }
//     },
//     limits: { fileSize: maxFileSize },
//   });
// };

const audioUploader = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname); // ensure extension
      cb(null, `${Date.now()}${ext}`);
    },
  }),
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
