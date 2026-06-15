import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { checkDeepResearchLimit } from '../../middlewares/checkSubscriptionLimits.js';
import { deepResearchController } from './deep_research.controller.js';
import { AppValidation } from './deep_research.validation.js';

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
  createRateLimiter(10, 15), // Rate limit first to prevent DB load/abuse from spam requests
  validateRequest(AppValidation.deepResearchQuerySchema), // Validate request payload before checking subscription limits
  checkDeepResearchLimit, // Check subscription limits only after passing rate limiting and validation
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
  createRateLimiter(30, 15), // Rate limit telemetry connections to prevent SSE abuse/resource exhaustion
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
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Include SUPER_ADMIN for comprehensive administrative access
  extractTenantContext, // Extract tenant context after auth
  deepResearchController.getDeepResearchStats
);

/**
 * @openapi
 * /api/v1/deep-research:
 *   get:
 *     summary: List all deep research reports for the workspace (Admin)
 *     description: Retrieves a paginated list of all deep research reports within the current workspace. Accessible only to users with `ADMIN` or `SUPER_ADMIN` roles for management and oversight.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of deep research reports.
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
 *                   example: Reports retrieved successfully.
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Define the report object structure here
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get(
  '/',
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), // Optimization: Add admin-only route to list all reports for workspace management.
  extractTenantContext,
  deepResearchController.listAllReports
);

/**
 * @openapi
 * /api/v1/deep-research/{savedId}:
 *   delete:
 *     summary: Delete a deep research report (Admin)
 *     description: Deletes a specific deep research report by its ID. Accessible only to users with `ADMIN` or `SUPER_ADMIN` roles to manage workspace content.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: savedId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the deep research report to delete.
 *     responses:
 *       200:
 *         description: Report deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Report not found.
 */
router.delete(
  '/:savedId',
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN), // Optimization: Add admin-only route for deleting reports.
  extractTenantContext,
  deepResearchController.deleteReport
);

/**
 * @openapi
 * /api/v1/deep-research/download-pdf/{savedId}:
 *   get:
 *     summary: Download a deep research report as a PDF
 *     description: Allows an authenticated user to download a previously saved deep research report in PDF format. Access is restricted to workspace members to ensure data security.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
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
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Report not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/download-pdf/:savedId',
  // Security Optimization: Changed from optionalAuth to auth to ensure only authenticated workspace members can download potentially sensitive reports.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext, // Extract tenant context after auth
  createRateLimiter(20, 15), // Rate limit downloads to prevent heavy PDF generation/bandwidth abuse
  deepResearchController.downloadPDF
);

/**
 * @openapi
 * /api/v1/deep-research/download-pptx/{savedId}:
 *   get:
 *     summary: Download a deep research presentation as a PPTX
 *     description: Allows an authenticated user to download a previously saved deep research report in PPTX (PowerPoint) format. Access is restricted to workspace members.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
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
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Report not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/download-pptx/:savedId',
  // Security Optimization: Changed from optionalAuth to auth to ensure only authenticated workspace members can download reports.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext, // Extract tenant context after auth
  createRateLimiter(20, 15), // Rate limit downloads to prevent heavy PPTX generation/bandwidth abuse
  deepResearchController.downloadPPTX
);

/**
 * Exports the deep research router.
 * @type {Router}
 */
export const deepResearchRoute = router;