import express from 'express';
import { SwarmController } from './swarm.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

/**
 * Express router for handling swarm-related API routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/swarm/stream:
 *   post:
 *     tags:
 *       - Swarm
 *     summary: Initiate a collaborative agent swarm stream
 *     description: Establishes a Server-Sent Events (SSE) connection to stream responses from a collaborative agent swarm.
 *                  Authentication is optional but can be used to identify the user for personalized swarm interactions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The initial prompt or query for the swarm.
 *                 example: "Explain the concept of quantum entanglement in simple terms."
 *               sessionId:
 *                 type: string
 *                 description: An optional session ID to maintain context across multiple swarm interactions.
 *                 example: "some-unique-session-id-123"
 *             required:
 *               - prompt
 *     responses:
 *       200:
 *         description: Successfully initiated SSE stream. Events will be sent as the swarm processes the request.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "event: message\ndata: {\"type\": \"chunk\", \"content\": \"...\"}\n\n"
 *       400:
 *         description: Bad Request - Missing or invalid prompt.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Prompt is required."
 *       401:
 *         description: Unauthorized - Invalid or expired authentication token provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: Invalid token."
 *       500:
 *         description: Internal Server Error - An unexpected error occurred on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error."
 *     security:
 *       - bearerAuth: []
 */
router.post('/stream', optionalAuth(), SwarmController.performSwarmStreamingSearch);

/**
 * @swagger
 * /api/swarm/prewarm:
 *   post:
 *     tags:
 *       - Swarm
 *     summary: Pre-warm a user's isolated container sandbox
 *     description: Asynchronously pre-warms an isolated container sandbox for a user, reducing latency for subsequent operations.
 *                  Authentication is optional but can be used to identify the user for whom the sandbox should be pre-warmed.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user for whom to pre-warm the sandbox. If not provided, the user from the optional JWT will be used.
 *                 example: "user-123"
 *     responses:
 *       200:
 *         description: Sandbox pre-warming initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Sandbox pre-warming initiated."
 *                 status:
 *                   type: string
 *                   example: "success"
 *       400:
 *         description: Bad Request - Invalid input or missing user context if no token is provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User ID is required if no authentication token is provided."
 *       401:
 *         description: Unauthorized - Invalid or expired authentication token provided.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized: Invalid token."
 *       500:
 *         description: Internal Server Error - An unexpected error occurred on the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Internal server error."
 *     security:
 *       - bearerAuth: []
 */
router.post('/prewarm', optionalAuth(), SwarmController.prewarmUserSandbox);

/**
 * Exposes the Swarm API routes.
 * @type {express.Router}
 */
export const SwarmRoutes = router;