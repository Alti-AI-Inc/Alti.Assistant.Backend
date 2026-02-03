import aws from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import config from '../../../../config/index.js';

const imgUploader = options => {
  const { folder, acl, supportedExtensions, maxFileSize } = options;

  const spacesEndpoint = new aws.Endpoint('nyc3.digitaloceanspaces.com');

  const s3 = new aws.S3({
    accessKeyId: config.cloud_storage_access_key,
    secretAccessKey: config.cloud_storage_secret_key,
    endpoint: spacesEndpoint,
  });

  const storage = multerS3({
    s3: s3,
    bucket: config.cloud_storage_bucket,
    acl: acl,
    key: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const extension = path.extname(file.originalname);
      const key = `${folder}/${uniqueSuffix}-${file.originalname}`;
      cb(null, key);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE,
  });

  return multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
      const extension = path.extname(file.originalname);
      if (supportedExtensions.test(extension)) {
        cb(null, true);
      } else {
        cb(new Error(`Must be ${supportedExtensions.toString()} image`));
      }
    },
    limits: {
      fileSize: maxFileSize,
    },
  });
};

export default imgUploader;
