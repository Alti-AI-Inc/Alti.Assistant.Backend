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
import { uploadDocumentReview } from './middlewares/uploadDocumentReview.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

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
  uploadDocumentReview.single('file'),
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
  uploadDocumentReview.single('file'),
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
 *           pattern: '^[0-9a-fA-F]{24}$'
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