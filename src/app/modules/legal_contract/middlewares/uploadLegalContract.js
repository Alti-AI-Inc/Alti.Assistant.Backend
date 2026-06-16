import { PubSub } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import path from 'path';
import { LEGAL_CONTRACT_CONFIG } from '../legal_contract.constant.js';

// --- GCP Client and Configuration Setup ---

/**
 * @description GCP Storage client instance. Used for uploading files to a GCS bucket.
 * This is a core component for making the service stateless.
 * @see https://cloud.google.com/nodejs/docs/reference/storage/latest
 */
const storageClient = new Storage();

/**
 * @description GCP Pub/Sub client instance. Used for publishing messages to trigger background jobs.
 * This enables asynchronous processing of long-running tasks.
 * @see https://cloud.google.com/nodejs/docs/reference/pubsub/latest
 */
const pubSubClient = new PubSub();

/**
 * @const {string} GCS_BUCKET_NAME
 * @description The name of the Google Cloud Storage bucket where legal contracts will be stored.
 * It's a best practice to configure this via environment variables for different environments.
 * @example
 * // In your .env file
 * // LEGAL_CONTRACTS_GCS_BUCKET=your-company-legal-contracts-bucket
 */
const GCS_BUCKET_NAME = process.env.LEGAL_CONTRACTS_GCS_BUCKET || 'development-legal-contracts-bucket';
const PUBSUB_TOPIC_NAME = process.env.LEGAL_CONTRACT_PROCESSING_TOPIC || 'projects/development-project/topics/development-legal-contract-topic';

if (!process.env.LEGAL_CONTRACTS_GCS_BUCKET || !process.env.LEGAL_CONTRACT_PROCESSING_TOPIC) {
  console.warn(
    'Warning: LEGAL_CONTRACTS_GCS_BUCKET and/or LEGAL_CONTRACT_PROCESSING_TOPIC are not set. Using fallback values. Legal contract features may not work correctly.'
  );
}

// --- Multer Configuration for In-Memory Processing ---

/**
 * @const {multer.StorageEngine} memoryStorage
 * @description Configures multer to store files in memory as a Buffer.
 * This is essential for a stateless, cloud-native architecture, as it avoids
 * writing to the ephemeral local filesystem of a container. The file buffer
 * is then streamed directly to a persistent storage service like GCS.
 */
const memoryStorage = multer.memoryStorage();

/**
 * @const {function(import('express').Request, Express.Multer.File, multer.FileFilterCallback)} fileFilter
 * @description A multer filter function to validate incoming files based on extension and MIME type.
 * This logic remains unchanged as it provides essential input validation before any processing.
 */
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  // Check file extension
  if (!LEGAL_CONTRACT_CONFIG.SUPPORTED_FILE_EXTENSIONS.includes(ext)) {
    return cb(
      new Error(
        `Invalid file type. Supported formats: ${LEGAL_CONTRACT_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', ')}`
      ),
      false
    );
  }

  // Check MIME type
  if (!LEGAL_CONTRACT_CONFIG.SUPPORTED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid MIME type. Supported types: ${LEGAL_CONTRACT_CONFIG.SUPPORTED_MIME_TYPES.join(', ')}`
      ),
      false
    );
  }

  cb(null, true);
};

/**
 * @const {import('multer').Multer} parseLegalContractUpload
 * @description A configured multer instance for parsing multipart/form-data.
 * It uses in-memory storage and the file filter. This middleware should be first in the chain
 * to handle the raw upload data and make it available on `req.file`.
 *
 * @example
 * // Usage in an Express route:
 * // router.post(
 * //   '/upload',
 * //   parseLegalContractUpload.single('contract'),
 * //   offloadLegalContractProcessing,
 * //   (req, res) => { ... }
 * // );
 */
export const parseLegalContractUpload = multer({
  storage: memoryStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: LEGAL_CONTRACT_CONFIG.MAX_FILE_SIZE,
  },
});

export const uploadLegalContract = parseLegalContractUpload;

// --- Asynchronous Offloading Middleware ---

/**
 * @function offloadLegalContractProcessing
 * @description An Express middleware that performs the core offloading logic. It should be placed
 * after `parseLegalContractUpload`.
 * 1. Streams the file from memory (`req.file.buffer`) to Google Cloud Storage.
 * 2. Publishes a message to a Google Pub/Sub topic with file metadata.
 * 3. Attaches GCS file information to `req.gcsFile` for the next handler (e.g., a controller).
 * This ensures the main request-response cycle is fast and that heavy processing
 * is handled by a separate, scalable background worker.
 * @param {import('express').Request} req - The Express request object, expected to have `req.file`.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 */
export const offloadLegalContractProcessing = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const bucket = storageClient.bucket(GCS_BUCKET_NAME);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(req.file.originalname);
    const gcsFileName = `contracts/${uniqueSuffix}${ext}`; // Use a structured path in the bucket.

    const blob = bucket.file(gcsFileName);
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
    });

    blobStream.on('error', (err) => {
      // Ensure GCS errors are passed to the central error handler.
      err.message = `GCS Upload Error: ${err.message}`;
      return next(err);
    });

    blobStream.on('finish', async () => {
      try {
        // The file is now in GCS. Attach its metadata to the request object
        // so the controller can, for example, save a reference to it in the database.
        req.gcsFile = {
          bucket: GCS_BUCKET_NAME,
          name: gcsFileName,
          gcsUri: `gs://${GCS_BUCKET_NAME}/${gcsFileName}`,
          mimetype: req.file.mimetype,
          size: req.file.size,
        };

        // Prepare the message for the background processing service.
        const messagePayload = {
          gcsUri: req.gcsFile.gcsUri,
          originalFilename: req.file.originalname,
          // Pass any other relevant context, like user or tenant ID.
          // This assumes user information is available on the request object from a preceding auth middleware.
          userId: req.user?.id,
          tenantId: req.user?.tenantId,
        };
        const dataBuffer = Buffer.from(JSON.stringify(messagePayload));

        // Publish the message to Pub/Sub to trigger the asynchronous workflow.
        await pubSubClient.topic(PUBSUB_TOPIC_NAME).publishMessage({ data: dataBuffer });

        // The offloading is complete. Proceed to the next middleware (usually the controller).
        return next();
      } catch (pubSubError) {
        // Ensure Pub/Sub errors are passed to the central error handler.
        pubSubError.message = `Pub/Sub Publishing Error: ${pubSubError.message}`;
        return next(pubSubError);
      }
    });

    // Start the stream by writing the file buffer from memory.
    blobStream.end(req.file.buffer);
  } catch (error) {
    return next(error);
  }
};

// --- Centralized Error Handling ---

/**
 * @function handleUploadError
 * @description An Express error-handling middleware for upload-related errors.
 * It now handles errors from multer (e.g., file size limit), GCS, and Pub/Sub,
 * providing a consistent error response format.
 * @param {Error | import('multer').MulterError} err - The error object.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The next middleware function.
 */
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is ${LEGAL_CONTRACT_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    // Catches errors from fileFilter, GCS upload, or Pub/Sub publishing.
    console.error('File offloading failed:', err); // Log the actual error for debugging.

    // Distinguish between client-side validation errors and server-side infrastructure errors.
    const isClientError = err.message.toLowerCase().startsWith('invalid');
    const statusCode = isClientError ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      message: err.message || 'An unexpected error occurred during file processing.',
    });
  }
  next();
};