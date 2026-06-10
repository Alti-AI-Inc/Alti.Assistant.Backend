import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { DeepseekAiController } from './deepseek.controller.js';

/**
 * @constant {express.Router} router
 * @description Express router instance for Deepseek AI related routes.
 */
const router = express.Router();

/**
 * @swagger
 * /deepseek/get-response:
 *   post:
 *     summary: Get a response from the Deepseek AI model.
 *     description: Sends a text prompt to the Deepseek AI model and retrieves its generated response.
 *                  This endpoint requires authentication with a valid JWT and specific user roles (ADMIN or USER).
 *     tags:
 *       - Deepseek AI
 *     security:
 *       - BearerAuth: []
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
 *                 description: The text prompt to send to the Deepseek AI model.
 *                 example: "What is the capital of France?"
 *     responses:
 *       200:
 *         description: Successfully retrieved a response from the Deepseek AI.
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
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The generated response text from the Deepseek AI.
 *                       example: "The capital of France is Paris."
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
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  DeepseekAiController.DeepseekAiGetResponse
);

/**
 * @constant {express.Router} deepseekAiRoutes
 * @description Exports the Deepseek AI router for use in the main application.
 */
export const deepseekAiRoutes = router;