import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { Llama4AiController } from './llama4.controller.js';
import catchAsync from '../../../shared/catchAsync.js';

/**
 * @constant {express.Router} router - Express router for Llama4 AI routes.
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/llama4/get-response:
 *   post:
 *     summary: Get a response from the Llama4 AI model.
 *     description: Sends a text prompt to the Llama4 AI model and retrieves a generated response.
 *                  This endpoint requires authentication with either ADMIN or USER roles.
 *     tags:
 *       - Llama4 AI
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
 *                 description: The text prompt to send to the Llama4 AI model.
 *                 example: "Explain the concept of quantum entanglement in simple terms."
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
 *                       description: The generated response from the Llama4 AI.
 *                       example: "Quantum entanglement is a phenomenon where two or more particles become linked..."
 *       400:
 *         description: Bad Request - Invalid prompt or missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 message:
 *                   type: string
 *                   example: "Prompt is required"
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access"
 *       403:
 *         description: Forbidden - User does not have the necessary roles (ADMIN or USER).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 403
 *                 message:
 *                   type: string
 *                   example: "Forbidden access"
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 message:
 *                   type: string
 *                   example: "Internal Server Error"
 */
router.post(
  '/get-response',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // Wrap the async controller to ensure any uncaught exceptions are passed to the global error handler.
  catchAsync(Llama4AiController.Llama4AiGetResponse)
);

/**
 * @exports {express.Router} llama4AiRoutes - The Express router for Llama4 AI related API endpoints.
 */
export const llama4AiRoutes = router;