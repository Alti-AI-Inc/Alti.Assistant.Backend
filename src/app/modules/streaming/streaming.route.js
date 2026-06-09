/**
 * @fileoverview This file defines the API routes for streaming-related operations.
 * It sets up an Express router and maps specific endpoints to controller functions.
 * @module app/modules/streaming/streaming.route
 * @requires express
 * @requires ../../modules/streaming/streaming.controller
 */

const express = require('express');
/**
 * Express router to handle streaming-related API routes.
 * @type {express.Router}
 */
const router = express.Router();
/**
 * Controller for handling streaming-related business logic.
 * @type {object}
 * @property {function(express.Request, express.Response, express.NextFunction): Promise<void>} authStreamingController - Handles authentication for streaming.
 */
const streamingController = require('./streaming.controller');

/**
 * @swagger
 * /api/streaming/get-token:
 *   get:
 *     summary: Retrieve an authentication token for streaming services.
 *     description: This endpoint is used to obtain a temporary authentication token required to access streaming services.
 *                  The token ensures secure access and authorization for streaming content.
 *     tags:
 *       - Streaming
 *       - Authentication
 *     responses:
 *       200:
 *         description: Successfully retrieved the streaming authentication token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   description: The authentication token for streaming.
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: Unauthorized access. Authentication credentials are missing or invalid.
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
 *                   example: "Unauthorized: Invalid credentials"
 *       500:
 *         description: Internal server error. Failed to generate the streaming token.
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
 *                   example: "Failed to generate streaming token"
 */
router.route('/get-token').get(streamingController.authStreamingController);

/**
 * Exports the Express router configured with streaming routes.
 * @type {express.Router}
 */
module.exports = router;