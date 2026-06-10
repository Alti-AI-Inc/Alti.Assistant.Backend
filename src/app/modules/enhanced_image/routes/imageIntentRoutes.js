import express from 'express';
import { createImageIntentController } from '../controllers/imageIntentController.js';

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
 * Ensures that the 'prompt' field is present and is a non-empty string.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
const validateAnalyzeIntentBody = (req, res, next) => {
  if (!req.body || typeof req.body.prompt !== 'string' || req.body.prompt.trim().length === 0) {
    return res.status(400).json({ message: 'Prompt is required and must be a non-empty string.' });
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
   *                  and extracts relevant parameters.
   *     tags:
   *       - Image Intent
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
   *                 description: Optional. A unique identifier for the user's session. If not provided, a new one might be generated.
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
   *         description: Invalid request body or missing prompt.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                   example: "Prompt is required."
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
  router.post('/analyze-intent', validateAnalyzeIntentBody, catchAsync(controller.analyzeIntent));

  return router;
};