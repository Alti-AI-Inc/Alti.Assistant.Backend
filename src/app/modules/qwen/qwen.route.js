import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { QwenAiController } from './qwen.controller.js';

/**
 * @swagger
 * tags:
 *   name: Qwen AI
 *   description: API endpoints for interacting with Qwen AI models.
 */

/**
 * Express router for Qwen AI related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/qwen/coder/get-response:
 *   post:
 *     summary: Get a code-related response from Qwen AI.
 *     description: Sends a prompt to the Qwen AI model specifically for code generation or analysis and retrieves its response.
 *     tags: [Qwen AI]
 *     security:
 *       - bearerAuth: []
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
 *                 description: The user's prompt or query for the AI.
 *                 example: "Write a JavaScript function to reverse a string."
 *               conversationId:
 *                 type: string
 *                 description: Optional ID to continue a previous conversation.
 *                 example: "conv-12345"
 *               model:
 *                 type: string
 *                 description: Optional, specifies the AI model to use (e.g., 'qwen-coder').
 *                 example: "qwen-coder"
 *     responses:
 *       200:
 *         description: Successfully retrieved AI response.
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
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "function reverseString(str) { return str.split('').reverse().join(''); }"
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the current conversation.
 *                       example: "conv-12345"
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
  '/coder/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  QwenAiController.QwenAiGetResponse
);

/**
 * @swagger
 * /api/v1/qwen/qwq/get-response:
 *   post:
 *     summary: Get a general response from Qwen AI.
 *     description: Sends a prompt to the Qwen AI model for general queries and retrieves its response.
 *     tags: [Qwen AI]
 *     security:
 *       - bearerAuth: []
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
 *                 description: The user's prompt or query for the AI.
 *                 example: "What is the capital of France?"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID to continue a previous conversation.
 *                 example: "conv-67890"
 *               model:
 *                 type: string
 *                 description: Optional, specifies the AI model to use (e.g., 'qwen-turbo').
 *                 example: "qwen-turbo"
 *     responses:
 *       200:
 *         description: Successfully retrieved AI response.
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
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     text:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "The capital of France is Paris."
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the current conversation.
 *                       example: "conv-67890"
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
  '/qwq/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  QwenAiController.QwenQWQAiGetResponse
);

/**
 * Exports the Qwen AI routes.
 * @type {express.Router}
 */
export const qwenAiRoutes = router;