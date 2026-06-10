import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { checkDeepResearchLimit } from '../../middlewares/checkSubscriptionLimits.js';
import { deepResearchController } from './deep_research.controller.js';
import { DeepResearchValidation } from './deep_research.validation.js';

/**
 * @typedef {import('express').Router} Router
 */

/**
 * Express router for deep research related routes.
 * @type {Router}
 */
const router = express.Router();

/**
 * @openapi
 * /api/v1/deep-research/assistant:
 *   post:
 *     summary: Perform a deep research query
 *     description: Initiates a deep research process based on a user query. This endpoint supports both authenticated users and guests, with optional authentication. It includes rate limiting (10 requests per 15 minutes due to computational cost), subscription limit checks, and request validation.
 *     tags:
 *       - Deep Research
 *     security:
 *       - optionalAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeepResearchQuery'
 *     responses:
 *       200:
 *         description: Deep research process initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Deep research initiated.
 *                 data:
 *                   type: object
 *                   properties:
 *                     researchId:
 *                       type: string
 *                       description: ID of the initiated research.
 *       400:
 *         description: Bad request (e.g., validation error, subscription limit exceeded).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized if optional authentication fails.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too Many Requests (rate limit exceeded).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/assistant',
  optionalAuth(), // Use optional auth to allow both authenticated and guest users
  extractTenantContext, // Extract tenant context after auth
  checkDeepResearchLimit,
  createRateLimiter(10, 15), // 10 deep research requests per 15 minutes (due to heavy computational cost)
  validateRequest(DeepResearchValidation.deepResearchQuerySchema),
  deepResearchController.performDeepResearch
);

/**
 * @openapi
 * /api/v1/deep-research/telemetry:
 *   get:
 *     summary: Stream deep research progress telemetry
 *     description: Provides a real-time Server-Sent Events (SSE) stream of progress updates for an ongoing deep research task. This endpoint is accessible to both authenticated users and guests.
 *     tags:
 *       - Deep Research
 *     security:
 *       - optionalAuth: []
 *     responses:
 *       200:
 *         description: A continuous stream of deep research progress updates.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: "event: progress\ndata: {\"status\": \"processing\", \"progress\": 50}\n\n"
 *       401:
 *         description: Unauthorized if optional authentication fails.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/telemetry',
  optionalAuth(),
  extractTenantContext,
  deepResearchController.telemetryStream
);

/**
 * @openapi
 * /api/v1/deep-research/stats:
 *   get:
 *     summary: Get deep research usage statistics
 *     description: Retrieves statistics related to deep research usage for the authenticated user or tenant. Accessible only to authenticated users with `ADMIN` or `USER` roles.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deep research statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Deep research statistics retrieved.
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalResearches:
 *                       type: number
 *                       example: 15
 *                     researchesThisMonth:
 *                       type: number
 *                       example: 5
 *                     lastResearchDate:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *       401:
 *         description: Unauthorized (missing or invalid token).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (user does not have required role).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  extractTenantContext, // Extract tenant context after auth
  deepResearchController.getDeepResearchStats
);

/**
 * @openapi
 * /api/v1/deep-research/download-pdf/{savedId}:
 *   get:
 *     summary: Download a deep research report as a PDF
 *     description: Allows downloading a previously saved deep research report in PDF format. This endpoint is accessible to both authenticated users and guests.
 *     tags:
 *       - Deep Research
 *     security:
 *       - optionalAuth: []
 *     parameters:
 *       - in: path
 *         name: savedId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the saved deep research report to download.
 *     responses:
 *       200:
 *         description: PDF file of the deep research report.
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized if optional authentication fails.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Report not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/download-pdf/:savedId',
  optionalAuth(), // Allow guest access to download PDFs
  extractTenantContext, // Extract tenant context after auth
  deepResearchController.downloadPDF
);

/**
 * @openapi
 * /api/v1/deep-research/download-pptx/{savedId}:
 *   get:
 *     summary: Download a deep research presentation as a PPTX
 *     description: Allows downloading a previously saved deep research report in PPTX (PowerPoint) format. This endpoint is accessible to both authenticated users and guests.
 *     tags:
 *       - Deep Research
 *     security:
 *       - optionalAuth: []
 *     parameters:
 *       - in: path
 *         name: savedId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the saved deep research report to download.
 *     responses:
 *       200:
 *         description: PPTX file of the deep research presentation.
 *         content:
 *           application/vnd.openxmlformats-officedocument.presentationml.presentation:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorized if optional authentication fails.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Report not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/download-pptx/:savedId',
  optionalAuth(), // Allow guest access to download PPTX
  extractTenantContext, // Extract tenant context after auth
  deepResearchController.downloadPPTX
);

/**
 * Exports the deep research router.
 * @type {Router}
 */
export const deepResearchRoute = router;