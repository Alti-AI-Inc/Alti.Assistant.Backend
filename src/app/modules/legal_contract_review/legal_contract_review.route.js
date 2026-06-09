import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { legalContractReviewController } from './legal_contract_review.controller.js';
import { LegalContractReviewValidation } from './legal_contract_review.validation.js';
import { uploadLegalContractReview } from './middlewares/uploadLegalContractReview.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

/**
 * @constant {express.Router} router - Express router instance for legal contract review routes.
 */
const router = express.Router();

/**
 * Middleware to ensure that if a conversationId is provided in the request body,
 * the user must be authenticated. This prevents unauthenticated users from
 * attempting to access or continue arbitrary conversations, mitigating IDOR.
 */
const requireAuthForConversationId = (req, res, next) => {
  // conversationId is expected in req.body (from formData)
  if (req.body.conversationId && !req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required to continue an existing conversation.'
    });
  }
  next();
};

/**
 * @swagger
 * /api/v1/legal-contract-review/assistant:
 *   post:
 *     summary: Engage in a conversational legal contract review.
 *     description: |
 *       Allows users to upload a contract file or provide contract text for AI-powered conversational review.
 *       Supports both authenticated and guest users. The AI can answer questions, summarize, and identify key clauses.
 *       This endpoint handles natural language requests intelligently, supporting file uploads or direct text input.
 *     tags:
 *       - Legal Contract Review
 *       - Assistant
 *     security: []
 *     consumes:
 *       - multipart/form-data
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The contract file to upload for review (e.g., PDF, DOCX, TXT).
 *         required: false
 *       - in: formData
 *         name: contractText
 *         type: string
 *         description: The contract text directly provided as a string. Use this if not uploading a file.
 *         required: false
 *       - in: formData
 *         name: message
 *         type: string
 *         description: The user's message or question to the AI assistant.
 *         required: true
 *       - in: formData
 *         name: conversationId
 *         type: string
 *         format: uuid
 *         description: Optional. The ID of an existing conversation to continue. If not provided, a new conversation starts.
 *         required: false
 *       - in: formData
 *         name: model
 *         type: string
 *         description: Optional. Specifies the AI model to use for the conversation (e.g., 'gpt-4o', 'claude-3-opus').
 *         required: false
 *       - in: formData
 *         name: temperature
 *         type: number
 *         format: float
 *         description: Optional. Controls the randomness of the AI's responses. Lower values mean more deterministic output.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful AI response to the conversational query.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "AI response generated successfully."
 *             data:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: string
 *                   format: uuid
 *                   example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                 response:
 *                   type: string
 *                   example: "Based on the contract, clause 3.1 outlines the payment terms..."
 *                 isNewConversation:
 *                   type: boolean
 *                   example: true
 *       400:
 *         $ref: '#/responses/BadRequest'
 *       401:
 *         $ref: '#/responses/Unauthorized'
 *       403:
 *         $ref: '#/responses/Forbidden'
 *       500:
 *         $ref: '#/responses/InternalServerError'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadLegalContractReview.single('file'),
  checkRAGFeature,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  requireAuthForConversationId, // Ensure authentication if continuing an existing conversation
  validateRequest(LegalContractReviewValidation.conversationalRequestSchema),
  legalContractReviewController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/legal-contract-review/review:
 *   post:
 *     summary: Perform a direct, non-conversational legal contract review.
 *     description: |
 *       Provides a programmatic endpoint for automated contract analysis.
 *       Users can upload a contract file or provide contract text and specify review parameters to receive a structured review output.
 *       This endpoint is suitable for API integrations requiring direct review without conversational interaction.
 *     tags:
 *       - Legal Contract Review
 *       - Review
 *     security: []
 *     consumes:
 *       - multipart/form-data
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: The contract file to upload for review (e.g., PDF, DOCX, TXT).
 *         required: false
 *       - in: formData
 *         name: contractText
 *         type: string
 *         description: The contract text directly provided as a string. Use this if not uploading a file.
 *         required: false
 *       - in: formData
 *         name: reviewType
 *         type: string
 *         description: The type of review to perform (e.g., 'summary', 'risk_assessment', 'clause_identification').
 *         required: true
 *       - in: formData
 *         name: model
 *         type: string
 *         description: Optional. Specifies the AI model to use for the review (e.g., 'gpt-4o', 'claude-3-opus').
 *         required: false
 *       - in: formData
 *         name: temperature
 *         type: number
 *         format: float
 *         description: Optional. Controls the randomness of the AI's output. Lower values mean more deterministic output.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful structured review output.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "Contract reviewed successfully."
 *             data:
 *               type: object
 *               properties:
 *                 reviewId:
 *                   type: string
 *                   format: uuid
 *                   example: "f1e2d3c4-b5a6-9876-5432-10fedcba9876"
 *                 reviewResult:
 *                   type: object
 *                   description: The structured output of the contract review based on the reviewType.
 *                   example:
 *                     summary: "The contract outlines a service agreement for software development..."
 *                     key_clauses: ["Payment Terms", "Scope of Work", "Termination"]
 *       400:
 *         $ref: '#/responses/BadRequest'
 *       401:
 *         $ref: '#/responses/Unauthorized'
 *       403:
 *         $ref: '#/responses/Forbidden'
 *       500:
 *         $ref: '#/responses/InternalServerError'
 */
router.post(
  '/review',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadLegalContractReview.single('file'),
  checkRAGFeature,
  // createRateLimiter(20, 15), // 20 reviews per 15 minutes
  validateRequest(LegalContractReviewValidation.reviewContractSchema),
  legalContractReviewController.reviewContract
);

/**
 * @swagger
 * /api/v1/legal-contract-review/conversation/{conversationId}:
 *   get:
 *     summary: Retrieve the full history of a legal contract review conversation.
 *     description: |
 *       Fetches all messages, AI responses, and metadata associated with a specific conversation ID.
 *       Requires user or admin authentication to access conversation history.
 *     tags:
 *       - Legal Contract Review
 *       - Conversation
 *     security:
 *       - bearerAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         type: string
 *         format: uuid
 *         description: The unique identifier of the conversation whose history is to be retrieved.
 *         required: true
 *     responses:
 *       200:
 *         description: Successful retrieval of conversation history.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: "Conversation history retrieved successfully."
 *             data:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: string
 *                   format: uuid
 *                   example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                         example: "user"
 *                       content:
 *                         type: string
 *                         example: "What are the key payment terms?"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00Z"
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     contractFileName:
 *                       type: string
 *                       example: "service_agreement.pdf"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T09:30:00Z"
 *       400:
 *         $ref: '#/responses/BadRequest'
 *       401:
 *         $ref: '#/responses/Unauthorized'
 *       403:
 *         $ref: '#/responses/Forbidden'
 *       404:
 *         $ref: '#/responses/NotFound'
 *       500:
 *         $ref: '#/responses/InternalServerError'
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext, // Extract tenant context after auth
  validateRequest(LegalContractReviewValidation.getConversationHistorySchema),
  legalContractReviewController.getConversationHistory
);

/**
 * @constant {express.Router} legalContractReviewRoutes - The main router for the legal contract review module.
 * This router aggregates all endpoints related to AI-powered legal contract review,
 * including conversational assistants, direct review, and conversation history retrieval.
 */
export const legalContractReviewRoutes = router;