/**
 * @file This file defines the API routes for the Orchestrator module.
 * It handles incoming user prompts, applies security and rate-limiting, and
 * routes them to the appropriate controller for processing by AI services.
 * @module app/modules/orchestrator/orchestrator.route
 */

import express from 'express';
import { orchestratorController } from './orchestrator.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { shieldOfLight } from '../../middlewares/shieldOfLight.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import catchAsync from '../../utils/catchAsync.js';

/**
 * Express router instance for orchestrator routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /orchestrator/route-prompt:
 *   post:
 *     summary: Routes a user prompt to the appropriate AI model or service.
 *     description: This endpoint receives a user prompt, applies security and rate-limiting measures,
 *       and then delegates the prompt to the orchestrator controller for intelligent routing
 *       to the most suitable backend AI service. It's designed for potentially high-cost
 *       operations, hence the stricter rate limiting.
 *     tags:
 *       - Orchestrator
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
 *                 description: The user's input prompt or query.
 *                 example: "What is the capital of France?"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID to maintain conversation context across multiple requests.
 *                 example: "conv-12345"
 *               userId:
 *                 type: string
 *                 description: Optional ID of the user making the request. Can also be extracted from the auth token.
 *                 example: "user-abcde"
 *     responses:
 *       200:
 *         description: Successful routing and response from the AI service.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   type: string
 *                   description: The AI-generated response to the prompt.
 *                   example: "Paris is the capital of France."
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the conversation context, if applicable.
 *                   example: "conv-12345"
 *       400:
 *         description: Bad Request - Invalid input prompt or missing required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Prompt is required."
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Please authenticate"
 *       403:
 *         description: Forbidden - User does not have permission or request was blocked by security middleware.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Access forbidden due to malicious content."
 *       429:
 *         description: Too Many Requests - Rate limit exceeded for this endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Too many requests, please try again after 15 minutes."
 *       500:
 *         description: Internal Server Error - An unexpected error occurred on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */
router.post(
  '/route-prompt',
  auth(), // Protect route with standard auth middleware
  shieldOfLight(), // Filter out malicious requests before processing
  createRateLimiter(20, 15), // 20 requests per 15 minutes — most expensive endpoint
  catchAsync(orchestratorController.routePrompt) // Wrap async controller to ensure errors are passed to the global error handler
);

/**
 * Exports the Express router configured with orchestrator routes.
 * @type {express.Router}
 */
export const orchestratorRoutes = router;