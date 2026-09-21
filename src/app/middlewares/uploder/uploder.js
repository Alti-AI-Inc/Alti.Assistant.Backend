import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import multer from 'multer';
import path from 'path';
import config from '../../../../config/index.js';

const s3Client = new S3Client({
  endpoint: config.objectStorage.endpoint,
  region: config.objectStorage.region,
  credentials: {
    accessKeyId: config.objectStorage.accessKey,
    secretAccessKey: config.objectStorage.secretKey,
  },
  forcePathStyle: true,
});

const bucketName = config.objectStorage.uploadsBucket;

/**
 * Custom Multer storage engine for S3-compatible object storage.
 */
export class S3StorageEngine {
  constructor(options) {
    this.folder = options.folder || 'uploads';
  }

  _handleFile(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = `${this.folder}/${uniqueSuffix}-${file.originalname}`;

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucketName,
        Key: fileName,
        Body: file.stream,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000',
      },
    });

    upload.done()
      .then((data) => {
        const endpoint = config.objectStorage.endpoint.replace(/\/$/, '');
        const publicUrl = `${endpoint}/${bucketName}/${fileName}`;
        
        cb(null, {
          path: fileName,
          filename: fileName,
          location: data.Location || publicUrl,
          key: fileName,
          bucket: bucketName,
        });
      })
      .catch((err) => cb(err));
  }

  _removeFile(req, file, cb) {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: file.path || file.key,
    });
    
    s3Client.send(command)
      .then(() => cb(null))
      .catch(cb);
  }
}

const imgUploader = (options) => {
  const { folder, acl, supportedExtensions, maxFileSize } = options;

  return multer({
    storage: new S3StorageEngine({ folder }),
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
