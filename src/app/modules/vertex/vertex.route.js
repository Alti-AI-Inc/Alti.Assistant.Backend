import express from 'express';
import { VertexController } from './vertex.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/vertex/anonymous-response:
 *   post:
 *     summary: Get a response from the public Gemini model without authentication via Vertex AI.
 *     description: Accepts a prompt and returns a response. Protected by IP-based rate limiter.
 *     tags:
 *       - Public Vertex AI / Guest Chat
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
 *                 description: The guest user's question or message.
 *                 example: "Explain quantum computing simply."
 *     responses:
 *       200:
 *         description: Response generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Response generated successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     reply:
 *                       type: string
 *                       example: "Quantum computing uses qubits..."
 *       400:
 *         description: Bad Request.
 *       429:
 *         description: Too Many Requests.
 *       500:
 *         description: Internal Server Error.
 */
router.post('/anonymous-response', VertexController.getAnonymousResponse);

export const vertexRoutes = router;
