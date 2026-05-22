import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';
import config from '../../../../config/index.js';

const storage = new Storage();
const bucketName = config.gcs?.uploads_bucket || config.cloud_storage_bucket || 'alti_assistant_uploads';

/**
 * Custom Multer storage engine for Google Cloud Storage.
 * Replaces legacy DigitalOcean Spaces (aws-sdk/multer-s3) with native GCS.
 */
class GCSStorageEngine {
  constructor(options) {
    this.folder = options.folder || 'uploads';
    this.bucket = storage.bucket(bucketName);
  }

  _handleFile(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileName = `${this.folder}/${uniqueSuffix}-${file.originalname}`;
    const blob = this.bucket.file(fileName);

    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        cacheControl: 'public, max-age=31536000',
      },
    });

    file.stream
      .pipe(blobStream)
      .on('error', (err) => cb(err))
      .on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
        cb(null, {
          path: fileName,
          filename: fileName,
          size: blob.metadata?.size,
          location: publicUrl,
          // Backward-compatible with multer-s3 response shape
          key: fileName,
          bucket: bucketName,
        });
      });
  }

  _removeFile(req, file, cb) {
    this.bucket.file(file.path || file.key).delete().then(() => cb(null)).catch(cb);
  }
}

const imgUploader = (options) => {
  const { folder, acl, supportedExtensions, maxFileSize } = options;

  return multer({
    storage: new GCSStorageEngine({ folder }),
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
