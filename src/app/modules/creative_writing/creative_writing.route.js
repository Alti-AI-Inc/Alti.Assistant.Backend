import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { creativeWritingController } from './creative_writing.controller.js';
import { CreativeWritingValidation } from './creative_writing.validation.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
// Import a middleware to check resource ownership, crucial for preventing IDOR.
// This middleware would typically verify that the requested resource (e.g., conversation)
// belongs to the authenticated user.
import checkOwnership from '../../middlewares/checkOwnership/checkOwnership.js';

/**
 * @file This file defines the API routes for the creative writing module.
 * It includes endpoints for interacting with a conversational assistant and retrieving conversation history.
 * @module creativeWritingRoutes
 */

/**
 * Express router for creative writing related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/creative-writing/assistant:
 *   post:
 *     summary: Engage with the creative writing assistant
 *     description: Main entry point for the conversational creative writing assistant. Supports both authenticated users and guests. Processes natural language requests to generate creative content based on a given prompt and optional context.
 *     tags:
 *       - Creative Writing
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The natural language prompt for the creative writing assistant.
 *                 example: "Write a short story about a detective solving a mystery in a futuristic city."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of an existing conversation to continue. If not provided, a new conversation will be started.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               model:
 *                 type: string
 *                 description: Optional. Specifies the AI model to use for generation (e.g., 'gpt-3.5-turbo', 'gpt-4').
 *                 example: "gpt-3.5-turbo"
 *               temperature:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 maximum: 2
 *                 description: Optional. Controls the randomness of the output. Higher values mean more creative/random output. Default is usually around 0.7.
 *                 example: 0.8
 *               maxTokens:
 *                 type: number
 *                 format: integer
 *                 minimum: 1
 *                 description: Optional. The maximum number of tokens to generate in the response.
 *                 example: 500
 *     responses:
 *       200:
 *         description: Successfully generated creative content.
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
 *                   example: "Creative content generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The generated creative content.
 *                       example: "In the neon-drenched alleys of Neo-Kyoto, Detective Kaito..."
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the conversation.
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *     security:
 *       - bearerAuth: []
 *         # Optional security, as optionalAuth() is used.
 *         # If a token is provided, it will be validated.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15),
  validateRequest(CreativeWritingValidation.conversationalRequestSchema),
  creativeWritingController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/creative-writing/conversation/{conversationId}:
 *   get:
 *     summary: Retrieve creative writing conversation history
 *     description: Fetches the complete history of a specific creative writing conversation for an authenticated user. Requires 'USER' or 'ADMIN' role.
 *     tags:
 *       - Creative Writing
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the conversation to retrieve.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Successfully retrieved conversation history.
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                         description: The role of the speaker (user or assistant).
 *                       content:
 *                         type: string
 *                         description: The message content.
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: The timestamp when the message was created.
 *                   example:
 *                     - role: user
 *                       content: "Tell me a story about a dragon."
 *                       timestamp: "2023-10-27T10:00:00Z"
 *                     - role: assistant
 *                       content: "Once upon a time, in the fiery peaks of Mount Cinder..."
 *                       timestamp: "2023-10-27T10:00:15Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  // Add a middleware to prevent Insecure Direct Object Reference (IDOR).
  // This ensures that the 'conversationId' requested belongs to the authenticated user.
  // The 'checkOwnership' middleware should verify the ownership of the resource
  // identified by 'conversationId' against the 'req.user.id' and 'req.tenant.id'.
  checkOwnership('conversationId', 'Conversation'),
  validateRequest(CreativeWritingValidation.getConversationHistorySchema),
  creativeWritingController.getConversationHistory
);

/**
 * Exports the creative writing router.
 * @type {express.Router}
 */
export const creativeWritingRoutes = router;