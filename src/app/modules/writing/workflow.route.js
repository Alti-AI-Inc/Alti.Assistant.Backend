import express from 'express';
import writingController from './writer.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

/**
 * @module writingWorkflowRoutes
 * @description Defines API routes for the writing assistant workflow.
 */

const router = express.Router();

/**
 * @swagger
 * /assistant:
 *   post:
 *     summary: Initiate a writing assistant request.
 *     description: |
 *       Handles requests to the AI writing assistant. This endpoint applies several middlewares:
 *       - `optionalAuth()`: Authenticates the user if a token is provided, making user-specific features available.
 *       - `extractTenantContext`: Extracts tenant information from the request, essential for multi-tenancy.
 *       - `checkDailyRequestLimit`: Verifies if the user or tenant has exceeded their daily request quota.
 *       The request is then processed by the `writingController` to generate AI-powered writing content.
 *     tags:
 *       - Writing
 *       - Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Input for the writing assistant. The specific schema is defined by the writingController.
 *             example:
 *               prompt: "Write a short story about a cat who learns to fly."
 *               options:
 *                 tone: "whimsical"
 *                 length: "short"
 *     responses:
 *       200:
 *         description: Successfully generated content from the writing assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: string
 *                   description: The generated text content.
 *                   example: "Once upon a time, there was a cat named Whiskers..."
 *       400:
 *         description: Bad request, e.g., missing or invalid prompt.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized if authentication is required for certain features and not provided.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden, e.g., daily request limit exceeded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - bearerAuth: [] # Indicates that a bearer token can optionally be used for authentication.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  writingController
);

/**
 * @exports writingRoutes
 * @description The Express router instance containing all writing workflow-related routes.
 */
export const writingRoutes = router;