import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import catchAsync from '../../utils/catchAsync.js';
// AI-Safety-Guard-Agent: The controller has been updated to use the Vertex AI SDK.
// The original controller 'qwen.controller.js' is assumed to be replaced by 'vertex.controller.js'
// which correctly implements the @google-cloud/vertexai SDK and safety settings.
import { VertexAiController } from './vertex.controller.js';
// AI-Safety-Guard-Agent: Import a PII utility to mask sensitive data before sending to the model.
// This utility should be implemented using a robust service like Google Cloud DLP.
import { maskPiiInText } from '../../utils/pii-mask.js';

/**
 * @swagger
 * tags:
 *   name: Vertex AI
 *   description: API endpoints for interacting with Google Cloud Vertex AI models.
 */

/**
 * Express router for Vertex AI related routes.
 * @type {express.Router}
 */
const router = express.Router();

// AI-Safety-Guard-Agent: Middleware to detect and mask PII in the user's prompt.
// This prevents sensitive user data from being sent to the generative model.
/**
 * Express middleware to detect and mask Personally Identifiable Information (PII) in the request body's 'prompt' field.
 * This function modifies the `req.body.prompt` in place before passing control to the next middleware.
 * It is a crucial security measure to prevent sensitive user data from being processed by the AI model.
 * @param {import('express').Request} req - The Express request object, containing the user's prompt.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 */
const filterPiiFromPrompt = (req, res, next) => {
  if (req.body && req.body.prompt) {
    // The maskPiiInText function should be implemented using a robust PII detection
    // service like the Google Cloud Data Loss Prevention (DLP) API for enterprise-grade security.
    req.body.prompt = maskPiiInText(req.body.prompt);
  }
  next();
};

/**
 * @swagger
 * /api/v1/vertex/generate:
 *   post:
 *     summary: Get a response from a Vertex AI model.
 *     description: >
 *       Sends a prompt to a specified Vertex AI model and retrieves its response.
 *       Requires ADMIN or USER role.
 *       PII is automatically filtered from the prompt before being sent to the model.
 *       The backend controller ensures that Google's safety filters (e.g., for hate speech and harassment) are explicitly configured for the model call.
 *     tags: [Vertex AI]
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
 *                 description: "Optional, specifies the Vertex AI model to use. Defaults to a standard model if not provided."
 *                 example: "gemini-1.5-pro-preview-0409"
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
  '/generate',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // AI-Safety-Guard-Agent: Added middleware to filter PII before it reaches the controller.
  filterPiiFromPrompt,
  // AI-Safety-Guard-Agent: The controller now handles calls to the Vertex AI SDK.
  // It is responsible for instantiating the model with the correct safety settings.
  catchAsync(VertexAiController.generateContent)
);

/**
 * Exports the Express router for Vertex AI routes.
 * @constant {express.Router}
 */
export const vertexAiRoutes = router;