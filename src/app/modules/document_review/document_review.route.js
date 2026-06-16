/**
 * @file Defines the routes for the Document Review module.
 * @module app/modules/document_review/document_review.route
 * @description This file sets up the Express router for handling document review and conversational AI endpoints.
 * It includes routes for direct document review, conversational interactions, and retrieving conversation history.
 * The routes are protected by various middleware for authentication, authorization, rate limiting, validation,
 * and feature checks. It also integrates a custom middleware for streaming file uploads directly to Google Cloud Storage.
 */

import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentReviewController } from './document_review.controller.js';
import { DocumentReviewValidation } from './document_review.validation.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// GCP Cloud Storage integration for direct, stateless file uploads.
import { Storage } from '@google-cloud/storage';
import Busboy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// --- Upload Configuration ---

/**
 * @constant {number} MAX_UPLOAD_SIZE_MB
 * @description Maximum file size for document uploads, in megabytes.
 * Sourced from the `MAX_DOCUMENT_UPLOAD_SIZE_MB` environment variable with a default of 25MB.
 * @default 25
 */
const MAX_UPLOAD_SIZE_MB = parseInt(
  process.env.MAX_DOCUMENT_UPLOAD_SIZE_MB || '25',
  10
);

/**
 * @constant {number} MAX_UPLOAD_SIZE_BYTES
 * @description The maximum file size in bytes, derived from `MAX_UPLOAD_SIZE_MB`.
 */
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/**
 * @constant {Set<string>} ALLOWED_MIMETYPES
 * @description A whitelist of allowed MIME types to enhance security and prevent processing of unsupported files.
 */
const ALLOWED_MIMETYPES = new Set([
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain', // .txt
  'text/markdown', // .md
  'text/csv', // .csv
]);

// --- GCS Setup ---

/**
 * @constant {Storage} storage
 * @description Google Cloud Storage client instance.
 * For authentication, the environment must be configured with Application Default Credentials.
 * @see {@link https://cloud.google.com/docs/authentication/production}
 */
const storage = new Storage();

/**
 * @constant {string} bucketName
 * @description The name of the Google Cloud Storage bucket for document uploads.
 * Must be provided via the `GCS_DOCUMENT_BUCKET` environment variable.
 * Throws an error on startup in production if the variable is not set.
 */
let bucketName = process.env.GCS_DOCUMENT_BUCKET;
if (!bucketName) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'Warning: GCS_DOCUMENT_BUCKET environment variable is not set. Initializing with a fallback bucket name for development/testing.'
    );
  } else {
    console.error(
      'CRITICAL: GCS_DOCUMENT_BUCKET environment variable is not set. File uploads will be unavailable. Using fallback.'
    );
  }
  bucketName = 'development-documents-bucket';
}

/**
 * @constant {import('@google-cloud/storage').Bucket} bucket
 * @description The Google Cloud Storage bucket object used for file operations.
 */
const bucket = storage.bucket(bucketName);

/**
 * @function streamUploadToGCS
 * @description Middleware to stream a file upload from a multipart/form-data request directly to Google Cloud Storage.
 * This avoids saving the file to the local ephemeral filesystem, which is crucial for stateless containerized environments.
 * It uses 'busboy' to parse the stream and pipes the file content to a GCS write stream.
 * It enforces strict limits on file size and MIME type for security and stability.
 * Non-file fields are populated into `req.body`.
 * The uploaded file's metadata (bucket, gcsObjectName, size, etc.) is attached to `req.file` to mimic multer's behavior for downstream controllers.
 * @param {string} fieldName - The name of the form field expected to contain the file.
 * @returns {import('express').RequestHandler} Express middleware function.
 */
const streamUploadToGCS = fieldName => (req, res, next) => {
  let uploadError = null;

  const busboy = Busboy({
    headers: req.headers,
    limits: {
      fileSize: MAX_UPLOAD_SIZE_BYTES, // Enforce file size limit at the stream level.
      files: 1, // Allow only one file per request.
      fields: 10, // Limit the number of non-file fields to prevent abuse.
    },
  });

  req.body = req.body || {};
  const fields = {};
  const uploads = {};

  // Process non-file fields and add them to a temporary object.
  busboy.on('field', (name, val) => {
    fields[name] = val;
  });

  // Process the file stream.
  busboy.on('file', (name, file, info) => {
    // If an error has already occurred (e.g., from a previous file), discard subsequent files.
    if (uploadError) {
      return file.resume();
    }

    // Skip if the field name doesn't match the one we're looking for.
    if (name !== fieldName) {
      return file.resume(); // Discard the stream.
    }

    const { filename, encoding, mimeType } = info;

    // --- Validation: File Type ---
    // Reject files with unsupported MIME types immediately.
    if (!ALLOWED_MIMETYPES.has(mimeType)) {
      uploadError = new Error(
        `Unsupported file type: ${mimeType}. Allowed types are: ${[
          ...ALLOWED_MIMETYPES,
        ].join(', ')}`
      );
      uploadError.statusCode = 415; // 415 Unsupported Media Type
      return file.resume(); // Discard the file stream.
    }

    // --- Validation: File Size ---
    // Busboy will automatically truncate the file if it exceeds the limit.
    // We listen for the 'limit' event to gracefully handle this and send a proper error response.
    file.on('limit', () => {
      uploadError = new Error(
        `File size exceeds the ${MAX_UPLOAD_SIZE_MB}MB limit.`
      );
      uploadError.statusCode = 413; // 413 Payload Too Large
      // The file stream is automatically stopped by busboy. We flag the error,
      // and the 'finish' handler will prevent further processing.
    });

    // Create a unique, secure object name for GCS.
    // Prefixing with tenant and user IDs helps organize files and enforce security policies.
    const tenantId = req.tenant?.id || 'guest';
    const userId = req.user?.id || 'anonymous';
    const uniqueId = uuidv4();
    const fileExtension = path.extname(filename);
    const gcsObjectName = `${tenantId}/${userId}/${uniqueId}${fileExtension}`;

    let fileSize = 0;
    file.on('data', chunk => {
      fileSize += chunk.length;
    });

    uploads[name] = {
      gcsObjectName,
      filename,
      encoding,
      mimeType,
      size: 0, // Will be updated on finish
    };

    const gcsFile = bucket.file(gcsObjectName);
    const stream = gcsFile.createWriteStream({
      metadata: {
        contentType: mimeType,
      },
      resumable: false, // Use simple upload for better performance with smaller files and streams.
    });

    // Pipe the incoming file stream from the request directly to GCS.
    file.pipe(stream);

    // It's crucial to handle errors on the GCS stream.
    stream.on('error', err => {
      req.unpipe(busboy); // Stop processing the request.
      next(err);
    });

    // When the GCS stream finishes, the upload is complete.
    stream.on('finish', () => {
      // Update the final file size.
      uploads[name].size = fileSize;
    });
  });

  // When busboy finishes parsing all fields and files.
  busboy.on('finish', () => {
    // --- Final Error Check ---
    // If any validation error occurred during streaming, propagate it now and stop.
    if (uploadError) {
      return next(uploadError);
    }

    // Populate req.body with the parsed fields.
    Object.assign(req.body, fields);

    // If a file was uploaded, attach its metadata to req.file for the controller.
    const uploadedFile = uploads[fieldName];
    if (uploadedFile) {
      req.file = {
        fieldname: fieldName,
        originalname: uploadedFile.filename,
        encoding: uploadedFile.encoding,
        mimetype: uploadedFile.mimeType,
        bucket: bucket.name,
        gcsObjectName: uploadedFile.gcsObjectName,
        path: `gs://${bucket.name}/${uploadedFile.gcsObjectName}`,
        size: uploadedFile.size, // The final size of the uploaded file in bytes.
      };
    } else if (req.method === 'POST' && !req.file) {
      // Ensure a file was actually provided if the endpoint expects one.
      // The validation schema should handle this, but this is an extra safeguard.
      const fileMissingError = new Error(
        `The form field '${fieldName}' is required.`
      );
      fileMissingError.statusCode = 400;
      return next(fileMissingError);
    }
    next();
  });

  // Handle busboy parsing errors.
  busboy.on('error', err => {
    next(err);
  });

  // Start the process by piping the request to busboy.
  req.pipe(busboy);
};

/**
 * @constant {express.Router} router - Express router for document review routes.
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/document-review/assistant:
 *   post:
 *     summary: Conversational AI Assistant Endpoint
 *     description: |
 *       Main entry point for the AI assistant, supporting natural language requests and file uploads.
 *       Accessible by both authenticated and guest users. Handles intelligent responses based on provided documents and messages.
 *       **Multi-tenancy:**
 *       - For authenticated users, uploaded files and conversations are associated with the user's tenant.
 *       - For guest users, resources may be handled anonymously or with temporary identifiers.
 *     tags:
 *       - Document Review
 *       - Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The document file (e.g., PDF, DOCX) to be reviewed or used as context for the conversation.
 *               message:
 *                 type: string
 *                 description: The user's natural language message or query for the assistant.
 *               conversationId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. The ID of an existing conversation to continue. If not provided, a new conversation will be started.
 *               model:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. The AI model to use for the conversation (e.g., 'gpt-4', 'claude-3').
 *               temperature:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 minimum: 0
 *                 maximum: 1
 *                 description: Optional. Controls the randomness of the AI's responses. Lower values make responses more deterministic.
 *               maxTokens:
 *                 type: number
 *                 format: integer
 *                 nullable: true
 *                 minimum: 1
 *                 description: Optional. The maximum number of tokens (words/characters) in the AI's response.
 *             required:
 *               - file
 *               - message
 *     responses:
 *       200:
 *         description: Successful response with the AI's reply and conversation details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Conversation successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     response:
 *                       type: string
 *                       example: "Based on the document, the main point is..."
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       413:
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       415:
 *         $ref: '#/components/responses/UnsupportedMediaType'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  // IMPROVED: File upload middleware now runs before storage limit check.
  // This ensures the check can use the actual size of the uploaded file.
  streamUploadToGCS('file'),
  checkStorageLimit, // Now accurately checks if the new file exceeds the user's quota.
  checkRAGFeature,
  createRateLimiter(30, 15),
  validateRequest(DocumentReviewValidation.conversationalRequestSchema),
  documentReviewController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/document-review/review:
 *   post:
 *     summary: Direct Document Review Endpoint
 *     description: |
 *       Provides a non-conversational, programmatic way to review documents by specifying all parameters directly.
 *       Useful for automated tasks or integrations requiring a direct answer based on a document and a prompt.
 *       **Multi-tenancy:**
 *       - For authenticated users, uploaded files are associated with the user's tenant.
 *       - For guest users, resources may be handled anonymously or with temporary identifiers.
 *     tags:
 *       - Document Review
 *       - Programmatic
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The document file (e.g., PDF, DOCX) to be reviewed.
 *               prompt:
 *                 type: string
 *                 description: The specific prompt or question for the document review.
 *               model:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. The AI model to use for the review (e.g., 'gpt-4', 'claude-3').
 *               temperature:
 *                 type: number
 *                 format: float
 *                 nullable: true
 *                 minimum: 0
 *                 maximum: 1
 *                 description: Optional. Controls the randomness of the AI's responses. Lower values make responses more deterministic.
 *               maxTokens:
 *                 type: number
 *                 format: integer
 *                 nullable: true
 *                 minimum: 1
 *                 description: Optional. The maximum number of tokens (words/characters) in the AI's response.
 *               outputFormat:
 *                 type: string
 *                 nullable: true
 *                 enum: [text, json]
 *                 description: Optional. Desired output format for the review result (e.g., 'json', 'text').
 *             required:
 *               - file
 *               - prompt
 *     responses:
 *       200:
 *         description: Successful response with the document review results.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document reviewed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     reviewResult:
 *                       type: string
 *                       example: "The document states that..."
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       413:
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       415:
 *         $ref: '#/components/responses/UnsupportedMediaType'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/review',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  // IMPROVED: File upload middleware now runs before storage limit check.
  streamUploadToGCS('file'),
  checkStorageLimit, // Now accurately checks if the new file exceeds the user's quota.
  checkRAGFeature,
  createRateLimiter(20, 15),
  validateRequest(DocumentReviewValidation.reviewDocumentSchema),
  documentReviewController.reviewDocument
);

/**
 * @swagger
 * /api/v1/document-review/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: |
 *       Fetches the complete history of a specific conversation by its unique identifier.
 *       **Permissions:**
 *       - Requires `USER` or `ADMIN` role.
 *       - A `USER` can only access conversations belonging to their own tenant.
 *       - An `ADMIN` can access conversations across tenants (behavior may depend on service implementation).
 *     tags:
 *       - Document Review
 *       - History
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           pattern: '^[0-9a-fA-F]{24}$'
 *         required: true
 *         description: The unique identifier of the conversation to retrieve.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Successful response with the conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             enum: [user, assistant]
 *                             example: "user"
 *                           content:
 *                             type: string
 *                             example: "What is this document about?"
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T10:00:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(DocumentReviewValidation.getConversationHistorySchema),
  documentReviewController.getConversationHistory
);

/**
 * @exports documentReviewRoutes
 * @description The Express router containing all document review related routes.
 * @type {express.Router}
 */
export const documentReviewRoutes = router;