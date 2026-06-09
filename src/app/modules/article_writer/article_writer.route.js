import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { articleWriterController } from './article_writer.controller.js';
import { ArticleWriterValidation } from './article_writer.validation.js';
import { uploadArticleFile } from './middlewares/uploadArticleFile.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

/**
 * Express router for handling article writer related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/article-writer/assistant:
 *   post:
 *     summary: AI Conversational Assistant
 *     description: Main entry point for the AI conversational assistant. Supports both authenticated and guest users, handling natural language requests intelligently with optional file uploads for RAG capabilities.
 *     tags:
 *       - Article Writer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 description: The user's natural language query or prompt for the assistant.
 *                 example: "Write an article about the benefits of AI in healthcare."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional file to provide context for Retrieval Augmented Generation (RAG).
 *             required:
 *               - content
 *     responses:
 *       200:
 *         description: Successfully processed the request and returned the AI's response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "AI response generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the current conversation.
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
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadArticleFile.single('file'),
  checkRAGFeature,
  createRateLimiter(30, 15),
  validateRequest(ArticleWriterValidation.conversationalRequestSchema),
  articleWriterController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/article-writer/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: Retrieves the full history of a specific conversation for an authenticated user.
 *     tags:
 *       - Article Writer
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Successfully retrieved the conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                         example: user
 *                       content:
 *                         type: string
 *                         example: "Hello, how are you?"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00.000Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  validateRequest(ArticleWriterValidation.getConversationHistorySchema),
  articleWriterController.getConversationHistory
);

/**
 * Exports the Express router for article writer routes.
 * @type {express.Router}
 */
export const articleWriterRoutes = router;