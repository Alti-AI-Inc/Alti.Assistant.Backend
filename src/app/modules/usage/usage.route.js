/**
 * @file usage.route.js
 * @description Defines the API routes for managing usage statistics within the application.
 * This file sets up the endpoints for retrieving usage data, protected by authentication and tenant context extraction.
 */

import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { usageController } from './usage.controller.js';

/**
 * @constant {express.Router} router
 * @description Express router instance for usage-related routes.
 */
const router = express.Router();

/**
 * @swagger
 * /usage/stats:
 *   get:
 *     summary: Retrieve usage statistics for the current tenant.
 *     description: >
 *       Fetches various usage statistics (e.g., API call counts, data usage, feature consumption)
 *       specific to the authenticated tenant.
 *       Requires a valid authentication token and successful tenant context extraction.
 *     tags:
 *       - Usage
 *     security:
 *       - bearerAuth: []
 *     parameters: []
 *     responses:
 *       200:
 *         description: Successfully retrieved usage statistics.
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
 *                   description: Object containing various usage statistics.
 *                   properties:
 *                     apiCalls:
 *                       type: number
 *                       example: 1250
 *                       description: Total number of API calls made by the tenant.
 *                     storageUsedGB:
 *                       type: number
 *                       format: float
 *                       example: 0.75
 *                       description: Amount of storage used by the tenant in GB.
 *                     activeUsers:
 *                       type: number
 *                       example: 15
 *                       description: Number of active users within the tenant.
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *                       description: Timestamp of when the statistics were last updated.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     x-middleware:
 *       - auth()
 *       - extractTenantContext
 */
router.get(
  '/stats',
  auth(),
  extractTenantContext,
  usageController.getUsageStats
);

/**
 * @exports {express.Router} usageRoutes
 * @description The Express router instance for usage-related API routes.
 */
export { router as usageRoutes };