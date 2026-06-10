import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { GeminiAiController } from './gemini.controller.js';

/**
 * @constant {express.Router} router - Express router for Gemini AI routes.
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/gemini/get-response:
 *   post:
 *     summary: Get a response from the Gemini AI model.
 *     description: Sends a prompt to the Gemini AI model and retrieves its generated response.
 *                  Requires authentication with ADMIN or USER role.
 *     tags:
 *       - Gemini AI
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The user's prompt or message to send to the AI.
 *                 example: "Tell me a short story about a brave knight."
 *     responses:
 *       200:
 *         description: AI response successfully retrieved.
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
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "Once upon a time, in a land far away..."
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
  GeminiAiController.GeminiAiGetResponse
);

/**
 * @swagger
 * /api/v1/gemini/flash/get-response:
 *   post:
 *     summary: Get a response from the Gemini 1.5 Flash AI model.
 *     description: Sends a prompt to the Gemini 1.5 Flash AI model (optimized for speed and cost)
 *                  and retrieves its generated response. Requires authentication with ADMIN or USER role.
 *     tags:
 *       - Gemini AI
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The user's prompt or message to send to the AI.
 *                 example: "Summarize the plot of Hamlet in 50 words."
 *     responses:
 *       200:
 *         description: AI response successfully retrieved from Gemini 1.5 Flash.
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
 *                   example: "Flash AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "Prince Hamlet seeks revenge for his father's murder by his uncle Claudius, who married Hamlet's mother. His indecision, madness, and a play within a play lead to a tragic end for most characters, including Hamlet himself."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/flash/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // BUG FIX: Renamed controller method to align with the route's purpose (Gemini 1.5 Flash).
  // The previous name 'Gemini25PreviewAiGetResponse' was misleading given the route path and description,
  // suggesting a different model version than intended for the '/flash' endpoint.
  GeminiAiController.GeminiFlashAiGetResponse
);

/**
 * @exports {express.Router} geminiAiRoutes - The router for Gemini AI related API endpoints.
 */
export const geminiAiRoutes = router;