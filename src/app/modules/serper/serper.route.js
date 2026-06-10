import express from 'express';
import { SerperAiController } from './serper.controller.js';
import { apiLimiter } from '../../middlewares/rateLimiter.js';

/**
 * Express router for Serper AI related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/serper/get-response:
 *   post:
 *     summary: Get a response from Serper AI based on a query.
 *     description: Sends a query to the Serper AI service and retrieves a structured response, which may include search results, answer boxes, or other AI-generated content. This is a rate-limited endpoint to prevent abuse and control costs.
 *     tags:
 *       - Serper AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The query string to send to Serper AI for processing.
 *                 example: "What is the current weather in London?"
 *     responses:
 *       200:
 *         description: Successful response from Serper AI.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: The structured response from Serper AI, containing search results, answer boxes, or other relevant information.
 *                   example: { "answerBox": { "snippet": "The current weather in London is partly cloudy with a temperature of 15°C." }, "organicResults": [] }
 *       400:
 *         description: Bad request, typically due to a missing or invalid 'query' parameter in the request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Query parameter is required in the request body."
 *       429:
 *         description: Too many requests. The user has exceeded the rate limit for this endpoint.
 *       500:
 *         description: Internal server error, indicating a problem with the Serper AI service or the backend processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to get response from Serper AI due to an internal server error."
 */
// Enterprise DDOS Guard: Applying a strict rate limit to this public, high-cost AI endpoint.
// This protects against API abuse, DDOS attacks, and prevents excessive cost runaway
// by limiting requests per IP address. A Redis-backed store is recommended for distributed environments.
router.route('/get-response').post(apiLimiter, SerperAiController.SerperAiGetResponse);

/**
 * Serper AI API routes.
 * This router handles all API endpoints related to interacting with the Serper AI service.
 * @constant
 * @type {express.Router}
 */
export const serperAiRoutes = router;