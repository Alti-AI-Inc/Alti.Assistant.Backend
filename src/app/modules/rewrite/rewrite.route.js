import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { rewriteController } from './rewrite.controller.js';
import { RewriteValidation } from './rewrite.validation.js';
import { uploadRewrite } from './middlewares/uploadRewrite.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

/**
 * @constant {express.Router} router - Express router instance for rewrite module routes.
 */
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Rewrite
 *   description: API for AI-powered content rewriting and conversational assistance.
 */

/**
 * @swagger
 * /api/v1/rewrite/assistant:
 *   post:
 *     summary: Conversational AI Assistant
 *     description: Main entry point for the AI conversational assistant. Supports both authenticated and guest users. Handles natural language requests intelligently, optionally with file uploads.
 *     tags:
 *       - Rewrite
 *       - Assistant
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or prompt for the assistant.
 *                 example: "Can you summarize this document for me?"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "654321098765432109876543"
 *               model:
 *                 type: string
 *                 description: Optional AI model to use for the conversation (e.g., 'gpt-4', 'claude-3').
 *                 example: "gpt-4"
 *               options:
 *                 type: object
 *                 description: Additional options for the assistant.
 *                 properties:
 *                   stream:
 *                     type: boolean
 *                     description: If true, the response will be streamed.
 *                     default: false
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional file to upload for context (e.g., PDF, DOCX, TXT).
 *     responses:
 *       200:
 *         description: Successful response with the assistant's reply.
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
 *                   example: "Assistant response generated successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     reply:
 *                       type: string
 *                       description: The assistant's generated response.
 *                       example: "Certainly, I can summarize the document for you. Please provide the file."
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the current conversation.
 *                       example: "654321098765432109876543"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  uploadRewrite.single('file'),
  createRateLimiter(30, 15), // 30 requests per 15 minutes - Uncommented for performance/security
  validateRequest(RewriteValidation.conversationalRequestSchema),
  rewriteController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/rewrite/rewrite:
 *   post:
 *     summary: Direct Content Rewrite
 *     description: Endpoint for direct, non-conversational content rewriting. Allows programmatic access with specific instructions and content.
 *     tags:
 *       - Rewrite
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The original content to be rewritten.
 *                 example: "The quick brown fox jumps over the lazy dog."
 *               instruction:
 *                 type: string
 *                 description: Specific instructions for how to rewrite the content (e.g., "make it more formal", "summarize in 100 words").
 *                 example: "Rewrite this sentence to be more formal and concise."
 *               model:
 *                 type: string
 *                 description: Optional AI model to use for the rewrite (e.g., 'gpt-4', 'claude-3').
 *                 example: "gpt-4"
 *               outputFormat:
 *                 type: string
 *                 description: Desired output format for the rewritten content (e.g., 'markdown', 'json', 'text').
 *                 example: "markdown"
 *               options:
 *                 type: object
 *                 description: Additional options for the rewrite process.
 *                 properties:
 *                   stream:
 *                     type: boolean
 *                     description: If true, the response will be streamed.
 *                     default: false
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional file to upload for additional context (e.g., style guide, reference document).
 *     responses:
 *       200:
 *         description: Successful response with the rewritten content.
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
 *                   example: "Content rewritten successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     rewrittenContent:
 *                       type: string
 *                       description: The AI-generated rewritten content.
 *                       example: "The agile vulpine traverses the indolent canine."
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/rewrite',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadRewrite.single('file'),
  checkRAGFeature,
  createRateLimiter(20, 15), // 20 rewrites per 15 minutes - Uncommented for performance/security
  validateRequest(RewriteValidation.rewriteContentSchema),
  rewriteController.rewriteContent
);

/**
 * @swagger
 * /api/v1/rewrite/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: Retrieves the complete history of a specific conversation by its ID. Requires authentication.
 *     tags:
 *       - Rewrite
 *       - Conversation
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
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
 *                   example: "Conversation history retrieved successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversation:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: "654321098765432109876543"
 *                         userId:
 *                           type: string
 *                           example: "user123"
 *                         messages:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               role:
 *                                 type: string
 *                                 enum: [user, assistant]
 *                                 example: "user"
 *                               content:
 *                                 type: string
 *                                 example: "Hello, how are you?"
 *                               timestamp:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2023-10-27T10:00:00.000Z"
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2023-10-27T09:55:00.000Z"
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2023-10-27T10:05:00.000Z"
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
  extractTenantContext,
  validateRequest(RewriteValidation.getConversationHistorySchema),
  rewriteController.getConversationHistory
);

/**
 * @exports {express.Router} rewriteRoutes - The Express router containing rewrite and assistant routes.
 */
export const rewriteRoutes = router;