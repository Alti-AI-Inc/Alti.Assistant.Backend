import * as Minio from 'minio';
import multer from 'multer';
import path from 'path';
import config from '../../../../config/index.js';

// MinIO client targeting Liberty Center One all-flash NVMe storage
// Apache 2.0 — zero AWS dependency
const minioClient = new Minio.Client({
  endPoint: (config.objectStorage?.endpoint || 'storage.libertycenterone.com').replace(/^https?:\/\//, ''),
  port: config.objectStorage?.port || 443,
  useSSL: (config.objectStorage?.endpoint || 'https://').startsWith('https'),
  accessKey: config.objectStorage?.accessKey || 'dev-key',
  secretKey: config.objectStorage?.secretKey || 'dev-secret',
  pathStyle: true,
});

const bucketName = config.objectStorage?.uploadsBucket || 'aphura-uploads';

/**
 * Custom Multer storage engine for S3-compatible object storage via MinIO client.
 * Targets Liberty Center One OpenStack Swift.
 */
export class S3StorageEngine {
  constructor(options) {
    this.folder = options.folder || 'uploads';
  }

  _handleFile(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = `${this.folder}/${uniqueSuffix}-${file.originalname}`;

    const chunks = [];
    file.stream.on('data', (chunk) => chunks.push(chunk));
    file.stream.on('end', () => {
      const buffer = Buffer.concat(chunks);

      minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
        'Content-Type': file.mimetype,
        'Cache-Control': 'public, max-age=31536000',
      })
        .then(() => {
          const endpoint = (config.objectStorage?.endpoint || 'https://storage.libertycenterone.com').replace(/\/$/, '');
          const publicUrl = `${endpoint}/${bucketName}/${fileName}`;

          cb(null, {
            path: fileName,
            filename: fileName,
            location: publicUrl,
            key: fileName,
            bucket: bucketName,
          });
        })
        .catch((err) => cb(err));
    });
    file.stream.on('error', (err) => cb(err));
  }

  _removeFile(req, file, cb) {
    minioClient.removeObject(bucketName, file.path || file.key)
      .then(() => cb(null))
      .catch(cb);
  }
}

const imgUploader = (options) => {
  const { folder, supportedExtensions, maxFileSize } = options;

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
