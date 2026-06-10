import { Storage } from '@google-cloud/storage';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { GCS_CONFIG } from '../document.constant.js';

// Initialize Google Cloud Storage
let storage;
let bucket;

try {
  // In a stateless container environment, authentication is best handled via
  // the environment's attached service account. The client library automatically
  // detects these credentials. We avoid referencing local key files.
  if (GCS_CONFIG.PROJECT_ID) {
    storage = new Storage({
      projectId: GCS_CONFIG.PROJECT_ID,
    });
  } else {
    logger.warn(
      'GCS_PROJECT_ID not configured. GCS services will be unavailable.'
    );
  }

  if (storage && GCS_CONFIG.BUCKET_NAME) {
    bucket = storage.bucket(GCS_CONFIG.BUCKET_NAME);
  }
} catch (error) {
  logger.error('Failed to initialize Google Cloud Storage:', error);
}

/**
 * Generates a v4 signed URL for uploading a file directly from the client.
 * This is the recommended approach for stateless services, as the backend
 * only brokers the transaction and never handles the file content itself.
 * @param {string} fileName - The name of the file to be uploaded.
 * @param {string} contentType - The MIME type of the file (e.g., 'application/pdf').
 * @param {object} documentMetadata - Metadata like userId, documentType, etc.
 * @returns {Promise<object>} An object containing the signed URL and the destination path.
 */
export const generateV4UploadSignedUrl = async (
  fileName,
  contentType,
  documentMetadata = {}
) => {
  if (!storage || !bucket) {
    const errorMsg = 'GCS not configured. Cannot generate signed URL.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const destination = `${GCS_CONFIG.FOLDER_PREFIX}${documentMetadata.userId || 'anonymous'}/${Date.now()}-${fileName}`;

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: contentType,
    extensionHeaders: {
      // Custom metadata must be prefixed with 'x-goog-meta-' in the signed URL headers
      'x-goog-meta-documenttype': documentMetadata.documentType || 'general',
      'x-goog-meta-uploadedat': new Date().toISOString(),
      'x-goog-meta-userid': documentMetadata.userId || 'anonymous',
      'x-goog-meta-title': documentMetadata.title || 'Untitled',
    },
  };

  try {
    const [url] = await bucket.file(destination).getSignedUrl(options);
    logger.info(`Generated v4 signed URL for: ${destination}`);
    return {
      success: true,
      url,
      gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${destination}`,
      destination,
      storageType: 'gcs',
    };
  } catch (error) {
    logger.error('Error generating v4 signed URL:', error);
    throw new Error('Could not generate upload URL.');
  }
};

/**
 * Uploads a file to GCS from a readable stream (e.g., from memory or another stream).
 * This avoids writing to the local filesystem, which is critical for stateless containers.
 * Use this when the backend must process or generate the file content before upload.
 * @param {ReadableStream} fileStream - The readable stream of the file content.
 * @param {string} fileName - The desired file name in the bucket.
 * @param {object} documentMetadata - Metadata like userId, documentType, etc.
 * @returns {Promise<object>} A promise that resolves with the upload result.
 */
export const uploadDocumentStreamToGCS = async (
  fileStream,
  fileName,
  documentMetadata = {}
) => {
  return new Promise((resolve, reject) => {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot upload stream.');
      // In a stream-based workflow, there's no local file to fall back to.
      // The caller must handle this failure.
      return reject(new Error('GCS not configured.'));
    }

    const destination = `${GCS_CONFIG.FOLDER_PREFIX}${documentMetadata.userId || 'anonymous'}/${fileName}`;
    const file = bucket.file(destination);

    const gcsStream = file.createWriteStream({
      resumable: false, // Use simple upload for streams/buffers
      metadata: {
        contentType: getContentType(fileName),
        metadata: {
          documentType: documentMetadata.documentType || 'general',
          uploadedAt: new Date().toISOString(),
          userId: documentMetadata.userId || 'anonymous',
          title: documentMetadata.title || 'Untitled',
        },
      },
    });

    gcsStream.on('error', (err) => {
      logger.error(`Error uploading stream to GCS at ${destination}:`, err);
      reject(err);
    });

    gcsStream.on('finish', async () => {
      logger.info(`Stream uploaded successfully to GCS: ${destination}`);
      try {
        // Generate a signed URL for reading the newly uploaded file
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        resolve({
          success: true,
          gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${destination}`,
          publicUrl: signedUrl,
          fileName,
          destination,
          storageType: 'gcs',
        });
      } catch (urlError) {
        logger.error(`Failed to get signed URL for ${destination}:`, urlError);
        reject(urlError);
      }
    });

    // Pipe the source stream to the GCS writable stream
    fileStream.pipe(gcsStream);
  });
};

/**
 * Get content type based on file extension
 */
const getContentType = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.md': 'text/markdown',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Delete document from GCS
 */
export const deleteDocumentFromGCS = async (gcsPath) => {
  try {
    if (!storage || !bucket) {
      logger.warn('GCS not configured. Cannot delete from GCS.');
      return { success: false, message: 'GCS not configured' };
    }

    // Extract file path from gs:// URL
    const filePath = gcsPath.replace(`gs://${GCS_CONFIG.BUCKET_NAME}/`, '');

    await bucket.file(filePath).delete();

    logger.info(`Document deleted from GCS: ${filePath}`);

    return { success: true, message: 'Document deleted successfully' };
  } catch (error) {
    logger.error('Error deleting document from GCS:', error);
    return { success: false, message: error.message };
  }
};