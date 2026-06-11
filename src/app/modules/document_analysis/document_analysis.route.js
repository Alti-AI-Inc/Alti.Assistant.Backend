import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentAnalysisController } from './document_analysis.controller.js';
import { DocumentAnalysisValidation } from './document_analysis.validation.js';
// GCS Change: Removed local upload middleware. File handling is now managed via GCS signed URLs.
// import { uploadDocumentAnalysis } from './middlewares/uploadDocumentAnalysis.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import { createRateLimiter } from '../../middlewares/rateLimiter/rateLimiter.js';

// --- Rate Limiter Definitions ---

// Rate limiter for guest (unauthenticated) access to the analysis endpoint.
// Limits requests by IP address to prevent abuse from anonymous users and control costs.
// Allows 15 analysis requests per hour from a single IP.
const analyzeGuestLimiter = createRateLimiter({
  keyPrefix: 'rl_analyze_guest_ip',
  points: 15, // 15 requests
  duration: 60 * 60, // per 1 hour
  keyGenerator: req => req.ip,
  errorMessage: 'Too many analysis requests from this IP. Please try again after an hour.',
});

// Rate limiter for authenticated user access to the analysis endpoint.
// Limits requests by user ID to prevent abuse and control costs for individual users.
// Allows 100 analysis requests per hour for a logged-in user.
// This complements the checkDailyRequestLimit middleware by providing short-term burst protection.
const analyzeUserLimiter = createRateLimiter({
  keyPrefix: 'rl_analyze_user_id',
  points: 100, // 100 requests
  duration: 60 * 60, // per 1 hour
  keyGenerator: req => req.user?.userId,
  errorMessage: 'You have made too many analysis requests. Please try again after an hour.',
});

// A conditional rate limiter for the /analyze endpoint.
// It applies the guest limiter for unauthenticated requests and the user limiter for authenticated ones.
const conditionalAnalyzeLimiter = (req, res, next) => {
  if (req.user && req.user.userId) {
    return analyzeUserLimiter(req, res, next);
  }
  return analyzeGuestLimiter(req, res, next);
};

// Rate limiter for fetching conversation history.
// Limits requests by user ID to prevent database spamming.
// Allows 200 requests per minute, which is sufficient for normal UI interaction.
const getConversationLimiter = createRateLimiter({
  keyPrefix: 'rl_get_conversation_user_id',
  points: 200, // 200 requests
  duration: 60, // per 1 minute
  keyGenerator: req => req.user?.userId,
  errorMessage: 'Too many requests to fetch conversation history. Please try again after a minute.',
});

const router = express.Router();

/**
 * @swagger
 * /api/v1/document-analysis/generate-upload-url:
 *   post:
 *     summary: Generate a secure signed URL for uploading a document directly to Google Cloud Storage.
 *     description: |
 *       This endpoint initiates the file upload process for document analysis in a stateless, cloud-native way.
 *       Instead of sending the file to the backend server, the client first requests a secure, short-lived URL.
 *       The client then uses this URL to upload the file directly to a GCS bucket.
 *       This approach avoids writing files to the local container filesystem and scales better.
 *
 *       **Workflow:**
 *       1. Client sends a POST request to this endpoint with the file's metadata (fileName, contentType, size).
 *       2. The backend authenticates the user, checks their storage quota, and generates a GCS v4 Signed URL.
 *       3. The backend returns the `signedUrl` and the final `gcsFilePath` for the file.
 *       4. The client uses the `signedUrl` to upload the file via a PUT request.
 *       5. After a successful upload, the client calls the `/analyze` endpoint, providing the `gcsFilePath`.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: File metadata required to generate the signed URL.
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - fileName
 *             - contentType
 *             - size
 *           properties:
 *             fileName:
 *               type: string
 *               description: The name of the file to be uploaded.
 *               example: "annual-report-2023.pdf"
 *             contentType:
 *               type: string
 *               description: The MIME type of the file.
 *               example: "application/pdf"
 *             size:
 *               type: number
 *               description: The size of the file in bytes. Used for storage limit checks.
 *               example: 2097152
 *     responses:
 *       200:
 *         description: Signed URL generated successfully.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "Signed URL generated successfully"
 *             data:
 *               type: object
 *               properties:
 *                 signedUrl:
 *                   type: string
 *                   description: The GCS v4 Signed URL for the client to upload the file to (using PUT).
 *                   example: "https://storage.googleapis.com/your-bucket/...?X-Goog-Algorithm=..."
 *                 gcsFilePath:
 *                   type: string
 *                   description: The unique path of the file within the GCS bucket. This should be passed to the /analyze endpoint.
 *                   example: "tenant-id/user-id/uuid/annual-report-2023.pdf"
 *       400:
 *         description: Bad Request. Invalid input or missing required parameters.
 *       401:
 *         description: Unauthorized. Authentication is required to upload files.
 *       403:
 *         description: Forbidden. The file size exceeds the user's available storage limit.
 */
router.post(
  '/generate-upload-url',
  // GCS Change: This endpoint is the new first step for file uploads. It must be authenticated.
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  // GCS Change: Storage limit is checked here, before the upload, based on the file size provided by the client.
  // The checkStorageLimit middleware must be adapted to read `req.body.size`.
  checkStorageLimit,
  validateRequest(DocumentAnalysisValidation.generateUploadUrlSchema),
  documentAnalysisController.generateUploadUrl
);

/**
 * @swagger
 * /api/v1/document-analysis/analyze:
 *   post:
 *     summary: Analyze a document from GCS or text with a natural language prompt.
 *     description: |
 *       This endpoint allows users to perform various analyses on a document or raw text.
 *       It supports both authenticated users and guests (for text-only analysis).
 *
 *       **For Document Analysis:**
 *       1. First, obtain a signed URL and `gcsFilePath` from the `/generate-upload-url` endpoint.
 *       2. Upload the document directly to GCS using the signed URL.
 *       3. Call this endpoint with the `gcsFilePath` received in step 1.
 *
 *       **For Text-Only Analysis:**
 *       Omit the `gcsFilePath` field and provide the text directly in the `prompt`.
 *
 *       **Rate Limiting**: Applied per-IP for guests and per-user for authenticated users to prevent abuse.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: [] # Optional authentication
 *     consumes:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: The analysis request payload.
 *         required: true
 *         schema:
 *           type: object
 *           required:
 *             - prompt
 *           properties:
 *             prompt:
 *               type: string
 *               description: The natural language prompt or question for the analysis.
 *               example: "Summarize this document and extract key entities."
 *             gcsFilePath:
 *               type: string
 *               description: The path to the file in GCS, obtained from the /generate-upload-url endpoint. Required for document analysis.
 *               example: "tenant-id/user-id/uuid/annual-report-2023.pdf"
 *             conversationId:
 *               type: string
 *               description: Optional ID of an existing conversation to continue the analysis within.
 *               example: "6543210fedcba98765432109"
 *             model:
 *               type: string
 *               description: Optional AI model to use for the analysis (e.g., 'gpt-4', 'claude-3').
 *               example: "gpt-4"
 *     responses:
 *       200:
 *         description: Analysis successful. Returns the analysis result and potentially a new conversation ID.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "Analysis successful"
 *             data:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: string
 *                   example: "6543210fedcba98765432109"
 *                 response:
 *                   type: string
 *                   example: "The document discusses..."
 *       400:
 *         description: Bad Request. Invalid input or missing required parameters.
 *       401:
 *         description: Unauthorized. Authentication token is invalid or missing for protected resources.
 *       403:
 *         description: Forbidden. Daily request limit exceeded or RAG feature is disabled for the tenant.
 *       429:
 *         description: Too Many Requests. Rate limit exceeded for this endpoint.
 *       500:
 *         description: Internal Server Error.
 */
router.post(
  '/analyze',
  // Middleware chain is ordered to fail as fast as possible, reducing server load.
  // 1. Authenticate if a token is provided. This is first to identify the user.
  optionalAuth(),
  // 2. Apply rate limiting early to block abusive requests. Differentiates between guests and users.
  conditionalAnalyzeLimiter,
  // 3. Extract tenant context for data isolation. Depends on auth.
  extractTenantContext,
  // 4. Perform quick checks that can fail fast.
  checkDailyRequestLimit, // Check overall usage quota.
  checkRAGFeature, // Check if the feature is enabled for the tenant.
  // GCS Change: Removed multer middleware (`uploadDocumentAnalysis`) and `checkStorageLimit`.
  // The backend no longer handles file streams directly. It receives a `gcsFilePath` instead.
  // Storage is checked pre-flight in the `/generate-upload-url` endpoint.
  // 5. Validate all request inputs from the JSON body.
  validateRequest(DocumentAnalysisValidation.analyzeRequestSchema),
  // 6. If all checks pass, proceed to the controller.
  documentAnalysisController.analyzeDocument
);

/**
 * @swagger
 * /api/v1/document-analysis/conversation/{conversationId}:
 *   get:
 *     summary: Retrieve the conversation history for a specific document analysis session.
 *     description: |
 *       This endpoint allows authenticated users (USER or ADMIN roles) to fetch the complete
 *       conversation history associated with a given `conversationId`.
 *       It requires authentication and extracts tenant context to ensure data isolation.
 *       **Rate Limiting**: Applied per-user to prevent database abuse.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         type: string
 *         required: true
 *         description: The unique identifier of the conversation whose history is to be retrieved.
 *         example: "6543210fedcba98765432109"
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "Conversation history fetched successfully"
 *             data:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   role:
 *                     type: string
 *                     enum: [user, assistant]
 *                     example: "user"
 *                   content:
 *                     type: string
 *                     example: "What is the main topic of this document?"
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     example: "2023-10-27T10:00:00Z"
 *       400:
 *         description: Bad Request. Invalid `conversationId` format.
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary role (USER or ADMIN) or access to this conversation.
 *       404:
 *         description: Not Found. The specified conversationId does not exist or belongs to another tenant.
 *       429:
 *         description: Too Many Requests. Rate limit exceeded for this endpoint.
 *       500:
 *         description: Internal Server Error.
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  // Apply rate limiting to protect the endpoint from being spammed by a single user.
  getConversationLimiter,
  extractTenantContext, // Extract tenant context after auth
  validateRequest(DocumentAnalysisValidation.getConversationHistorySchema),
  documentAnalysisController.getConversationHistory
);

/**
 * @typedef {import('express').Router} Router
 */

/**
 * Express router for document analysis related routes.
 * This router handles API endpoints for analyzing documents/text and retrieving conversation history.
 * @type {Router}
 */
export const documentAnalysisRoutes = router;