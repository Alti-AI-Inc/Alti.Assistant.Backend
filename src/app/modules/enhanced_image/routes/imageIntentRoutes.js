import express from 'express';
import { createImageIntentController } from '../controllers/imageIntentController.js';
// Alti.Assistant - Improvement: Import necessary middleware for security, rate limiting, and usage quotas.
// These are essential for a robust, multi-user platform to ensure fair use, prevent abuse, and manage costs.
import { authenticateUser } from '../../auth/middlewares/authMiddleware.js'; // Assumed path for authentication middleware
import { checkUsageQuota } from '../../billing/middlewares/quotaMiddleware.js'; // Assumed path for usage quota middleware
import { applyRateLimiting } from '../../core/middlewares/rateLimitMiddleware.js'; // Assumed path for rate limiting middleware

/**
 * @module routes/imageIntentRoutes
 * @description Provides routes for analyzing user intent related to image generation or manipulation.
 */

/**
 * Utility function to wrap async Express route handlers.
 * Catches any errors from async functions and passes them to the Express error handling middleware.
 * This prevents unhandled promise rejections from crashing the Node.js process.
 * @param {Function} fn - The async Express route handler function (req, res, next).
 * @returns {Function} A new function that executes the handler and catches errors.
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Middleware to validate the request body for the /analyze-intent endpoint.
 * Alti.Assistant - Improvement: Enhanced validation to check for prompt length and validate sessionId format.
 * This prevents oversized payloads and ensures data integrity, leading to a more stable user experience.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
const validateAnalyzeIntentBody = (req, res, next) => {
  const { prompt, sessionId } = req.body;
  const errors = [];
  const MAX_PROMPT_LENGTH = 4096; // Define a reasonable max length for prompts

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    errors.push('Prompt is required and must be a non-empty string.');
  } else if (prompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`Prompt exceeds the maximum allowed length of ${MAX_PROMPT_LENGTH} characters.`);
  }

  // Optional: Validate sessionId format if it exists
  if (sessionId && (typeof sessionId !== 'string' || sessionId.trim().length === 0)) {
    errors.push('If provided, sessionId must be a non-empty string.');
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'Invalid request body.', errors });
  }

  next();
};

/**
 * Creates and configures an Express router for image intent analysis.
 * This router handles API endpoints related to processing user prompts to determine
 * their intent for image-related actions.
 *
 * @param {object} sessionManager - An object responsible for managing user sessions,
 *                                  potentially used by the underlying controller to maintain state.
 * @returns {express.Router} An Express router instance with defined image intent routes.
 */
export const createImageIntentRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createImageIntentController(sessionManager);

  /**
   * @openapi
   * /analyze-intent:
   *   post:
   *     summary: Analyze image intent from a prompt.
   *     description: Processes a user prompt to determine the intent related to image generation or manipulation, leveraging AI models.
   *                  This endpoint helps in understanding if the user wants to generate, modify, or describe an image,
   *                  and extracts relevant parameters. This is a protected endpoint and requires user authentication.
   *     tags:
   *       - Image Intent
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
   *                 description: The user's natural language prompt describing their image-related request.
   *                 example: "Generate an image of a cat playing guitar in a cyberpunk city."
   *               sessionId:
   *                 type: string
   *                 description: Optional. A unique identifier for the user's chat session. If not provided, a new one might be generated.
   *                 example: "user123-session456"
   *     responses:
   *       200:
   *         description: Intent successfully analyzed and returned.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 intent:
   *                   type: string
   *                   description: The determined intent (e.g., "GENERATE_IMAGE", "MODIFY_IMAGE", "DESCRIBE_IMAGE", "UNKNOWN").
   *                   example: "GENERATE_IMAGE"
   *                 parameters:
   *                   type: object
   *                   description: Extracted parameters relevant to the intent (e.g., subject, style, modifications).
   *                   example:
   *                     subject: "cat playing guitar"
   *                     style: "cyberpunk city"
   *                 sessionId:
   *                   type: string
   *                   description: The session ID used for the request, either provided by the client or newly generated.
   *                   example: "user123-session456"
   *       400:
   *         description: Invalid request body, missing prompt, or prompt is too long.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Prompt is required."
   *       401:
   *         description: Unauthorized. Authentication token is missing or invalid.
   *       403:
   *         description: Forbidden. The user has exceeded their usage quota for this feature.
   *       429:
   *         description: Too many requests. The user has sent too many requests in a given amount of time.
   *       500:
   *         description: Internal server error during intent analysis.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Failed to analyze image intent."
   */
  // Alti.Assistant - Improvement: Added a chain of middleware to secure the endpoint and manage user access.
  // 1. applyRateLimiting: Prevents API abuse and ensures service stability for all users.
  // 2. authenticateUser: Verifies user identity, which is crucial for data isolation and tracking usage.
  // 3. checkUsageQuota: Enforces user-level limits based on their subscription plan, managing operational costs.
  // 4. validateAnalyzeIntentBody: Ensures the incoming data is valid before processing.
  // 5. catchAsync(controller.analyzeIntent): The core logic, wrapped to handle any errors gracefully.
  router.post(
    '/analyze-intent',
    applyRateLimiting,
    authenticateUser,
    checkUsageQuota,
    validateAnalyzeIntentBody,
    catchAsync(controller.analyzeIntent)
  );

  return router;
};