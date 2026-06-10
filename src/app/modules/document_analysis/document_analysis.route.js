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
import { uploadDocumentAnalysis } from './middlewares/uploadDocumentAnalysis.js';
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
 * /api/v1/document-analysis/analyze:
 *   post:
 *     summary: Analyze a document or text with a natural language prompt.
 *     description: |
 *       This endpoint allows users to upload a document file or provide text along with a natural language prompt
 *       to perform various analyses. It supports both authenticated users and guests.
 *       The process involves optional authentication, tenant context extraction, daily request limit checks,
 *       storage limit checks (for file uploads), file upload handling, RAG feature checks, and request validation.
 *       **Rate Limiting**: Applied per-IP for guests and per-user for authenticated users to prevent abuse.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: [] # Optional authentication
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The document file to be analyzed (e.g., PDF, DOCX, TXT). Optional if 'prompt' is provided for text analysis.
 *       - in: formData
 *         name: prompt
 *         type: string
 *         required: true
 *         description: The natural language prompt or question for the document analysis.
 *         example: "Summarize this document and extract key entities."
 *       - in: formData
 *         name: conversationId
 *         type: string
 *         description: Optional ID of an existing conversation to continue the analysis within.
 *         example: "6543210fedcba98765432109"
 *       - in: formData
 *         name: model
 *         type: string
 *         description: Optional AI model to use for the analysis (e.g., 'gpt-4', 'claude-3').
 *         example: "gpt-4"
 *     responses:
 *       200:
 *         description: Document analysis successful. Returns the analysis result and potentially a new conversation ID.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "Document analyzed successfully"
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
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: "Validation Error: 'prompt' is required."
 *       401:
 *         description: Unauthorized. Authentication token is invalid or missing for protected resources.
 *       403:
 *         description: Forbidden. Daily request limit exceeded, storage limit exceeded, or RAG feature is disabled for the tenant.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: "Daily request limit exceeded."
 *       429:
 *         description: Too Many Requests. Rate limit exceeded for this endpoint.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: "Too many analysis requests from this IP. Please try again after an hour."
 *       500:
 *         description: Internal Server Error.
 */
router.post(
  '/analyze',
  optionalAuth(),
  // Apply conditional rate limiting after authentication middleware to distinguish between guests and users.
  conditionalAnalyzeLimiter,
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadDocumentAnalysis.single('file'),
  checkRAGFeature,
  validateRequest(DocumentAnalysisValidation.analyzeRequestSchema),
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
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: "Validation Error: 'conversationId' must be a valid Mongo ID."
 *       401:
 *         description: Unauthorized. Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden. User does not have the necessary role (USER or ADMIN) or access to this conversation.
 *       404:
 *         description: Not Found. The specified conversationId does not exist or belongs to another tenant.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: "Conversation not found."
 *       429:
 *         description: Too Many Requests. Rate limit exceeded for this endpoint.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: "Too many requests to fetch conversation history. Please try again after a minute."
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