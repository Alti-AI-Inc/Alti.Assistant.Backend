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
// import { uploadDocumentReview } from './middlewares/uploadDocumentReview.js'; // REPLACED: Multer middleware that writes to local disk is replaced with a direct GCS stream.
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// GCP Cloud Storage integration for direct, stateless file uploads.
import { Storage } from '@google-cloud/storage';
import Busboy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// --- GCS Setup ---
// Instantiate a GCS client.
// For authentication, ensure the environment is configured with Application Default Credentials.
// See: https://cloud.google.com/docs/authentication/production
const storage = new Storage();

// The GCS bucket name must be provided via an environment variable.
const bucketName = process.env.GCS_DOCUMENT_BUCKET;
if (!bucketName) {
  // Throw an error on startup if the bucket isn't configured, preventing runtime failures.
  throw new Error(
    'GCS_DOCUMENT_BUCKET environment variable is not set. This is required for file uploads.'
  );
}
const bucket = storage.bucket(bucketName);

/**
 * @function streamUploadToGCS
 * @description Middleware to stream a file upload from a multipart/form-data request directly to Google Cloud Storage.
 * This avoids saving the file to the local ephemeral filesystem, which is crucial for stateless containerized environments.
 * It uses 'busboy' to parse the stream and pipes the file content to a GCS write stream.
 * Non-file fields are populated into `req.body`.
 * The uploaded file's metadata (bucket, gcsObjectName, etc.) is attached to `req.file` to mimic multer's behavior for downstream controllers.
 * @param {string} fieldName - The name of the form field expected to contain the file.
 * @returns {function} Express middleware function.
 */
const streamUploadToGCS = fieldName => (req, res, next) => {
  const busboy = Busboy({ headers: req.headers });

  req.body = req.body || {};
  const fields = {};
  const uploads = {};

  // Process non-file fields and add them to a temporary object.
  busboy.on('field', (name, val) => {
    fields[name] = val;
  });

  // Process the file stream.
  busboy.on('file', (name, file, info) => {
    // Skip if the field name doesn't match the one we're looking for.
    if (name !== fieldName) {
      return file.resume(); // Discard the stream.
    }

    const { filename, encoding, mimeType } = info;

    // Create a unique, secure object name for GCS.
    // Prefixing with tenant and user IDs helps organize files and enforce security policies.
    const tenantId = req.tenant?.id || 'guest';
    const userId = req.user?.id || 'anonymous';
    const uniqueId = uuidv4();
    const fileExtension = path.extname(filename);
    const gcsObjectName = `${tenantId}/${userId}/${uniqueId}${fileExtension}`;

    uploads[name] = {
      gcsObjectName,
      filename,
      encoding,
      mimeType,
    };

    const gcsFile = bucket.file(gcsObjectName);
    const stream = gcsFile.createWriteStream({
      metadata: {
        contentType: mimeType,
      },
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
      // We don't call next() here because busboy might still be processing other fields.
      // We wait for the 'finish' event on busboy itself.
    });
  });

  // When busboy finishes parsing all fields and files.
  busboy.on('finish', () => {
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
        // Note: File size is not easily available here without buffering.
        // The controller should be adapted if it strictly depends on the size.
      };
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
 *     description: Main entry point for the AI assistant, supporting natural language requests and file uploads.
 *                  Accessible by both authenticated and guest users. Handles intelligent responses based on provided documents and messages.
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
  checkStorageLimit,
  streamUploadToGCS('file'), // NEW: Streams file directly to GCS without saving to the local filesystem.
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
 *     description: Provides a non-conversational, programmatic way to review documents by specifying all parameters directly.
 *                  Useful for automated tasks or integrations requiring a direct answer based on a document and a prompt.
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
  checkStorageLimit,
  streamUploadToGCS('file'), // NEW: Streams file directly to GCS without saving to the local filesystem.
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
 *     description: Fetches the complete history of a specific conversation by its unique identifier.
 *                  Requires user or admin authentication to ensure access control.
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
 *           pattern: '^[0-9a-fA-F]{24}
 *         required: true
 *         description: The unique identifier of the conversation to retrieve history for.
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
 * @exports {express.Router} documentReviewRoutes - The Express router containing all document review related routes.
 */
export const documentReviewRoutes = router;