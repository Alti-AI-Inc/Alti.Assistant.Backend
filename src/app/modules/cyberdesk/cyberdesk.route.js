/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           description: The HTTP status code.
 *           example: 400
 *         message:
 *           type: string
 *           description: A descriptive error message.
 *           example: "Invalid input data."
 *         stack:
 *           type: string
 *           description: The error stack trace (only in development).
 *           example: "Error: Invalid input data\n    at Function.createError (C:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\node_modules\\http-errors\\index.js:100:15)"
 *   securitySchemes:
 *      bearerAuth:
 *          type: http
 *          scheme: bearer
 *          bearerFormat: JWT
 */

import express from 'express';
// Assuming the controller now includes methods for platform owner actions.
import { cyberdeskController } from './cyberdesk.controller.js';

/**
 * Utility function to wrap async Express route handlers.
 * This ensures that any errors (rejected promises) from async handlers
 * are caught and passed to the Express error handling middleware,
 * preventing unhandled promise rejections that could crash the application.
 * @param {Function} fn - The async Express route handler function.
 * @returns {Function} An Express-compatible middleware function.
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

/**
 * Express router for Cyberdesk module routes.
 * This router handles all API endpoints related to managing and interacting with Cyberdesk instances,
 * as well as platform-level administrative functions.
 * @type {express.Router}
 */
const router = express.Router();

// =================================================================
// Tenant-Facing Cyberdesk Routes
// =================================================================

/**
 * @swagger
 * tags:
 *   name: Cyberdesk
 *   description: API for managing Cyberdesk instances and interactions.
 */

/**
 * @swagger
 * /api/cyberdesk/launch:
 *   post:
 *     summary: Launch a new Cyberdesk instance.
 *     description: Initiates and provisions a new Cyberdesk instance based on the provided configuration.
 *     tags: [Cyberdesk]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               config:
 *                 type: object
 *                 description: Configuration object for the new Cyberdesk instance.
 *                 example: { "type": "default", "region": "us-east-1", "size": "medium" }
 *             required:
 *               - config
 *     responses:
 *       201:
 *         description: Cyberdesk instance launched successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: The unique ID of the newly launched Cyberdesk instance.
 *                   example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                 message:
 *                   type: string
 *                   example: "Cyberdesk instance launched successfully."
 *       400:
 *         description: Bad request, invalid launch parameters provided.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error during Cyberdesk instance launch.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/launch', catchAsync(cyberdeskController.launch));

/**
 * @swagger
 * /api/cyberdesk/info/{id}:
 *   get:
 *     summary: Get information about a specific Cyberdesk instance.
 *     description: Retrieves detailed status and configuration information for a given Cyberdesk instance ID.
 *     tags: [Cyberdesk]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique ID of the Cyberdesk instance.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Cyberdesk instance information retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   description: The ID of the Cyberdesk instance.
 *                   example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                 status:
 *                   type: string
 *                   description: Current operational status of the instance (e.g., 'running', 'stopped', 'error').
 *                   example: "running"
 *                 details:
 *                   type: object
 *                   description: Additional details about the instance, such as IP address, creation time, etc.
 *                   example: { "ipAddress": "192.168.1.100", "createdAt": "2023-10-27T10:00:00Z" }
 *       404:
 *         description: Cyberdesk instance not found with the provided ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error while retrieving Cyberdesk instance information.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/info/:id', catchAsync(cyberdeskController.info));

/**
 * @swagger
 * /api/cyberdesk/click/{id}:
 *   post:
 *     summary: Simulate a click action within a Cyberdesk instance.
 *     description: Sends a command to a running Cyberdesk instance to simulate a mouse click at specified coordinates.
 *     tags: [Cyberdesk]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique ID of the Cyberdesk instance.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               x:
 *                 type: number
 *                 description: The X-coordinate for the click action.
 *                 example: 100
 *               y:
 *                 type: number
 *                 description: The Y-coordinate for the click action.
 *                 example: 250
 *               button:
 *                 type: string
 *                 enum: [left, right, middle]
 *                 description: The mouse button to simulate (default is 'left').
 *                 default: left
 *                 example: "left"
 *             required:
 *               - x
 *               - y
 *     responses:
 *       200:
 *         description: Click action performed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Click action performed successfully."
 *       400:
 *         description: Bad request, invalid click parameters or instance not ready for interaction.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cyberdesk instance not found with the provided ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error during click action simulation.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/click/:id', catchAsync(cyberdeskController.click));

/**
 * @swagger
 * /api/cyberdesk/bash/{id}:
 *   post:
 *     summary: Execute a bash command within a Cyberdesk instance.
 *     description: Runs a specified bash command inside the target Cyberdesk instance and returns its output.
 *     tags: [Cyberdesk]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique ID of the Cyberdesk instance.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               command:
 *                 type: string
 *                 description: The bash command string to execute.
 *                 example: "ls -la /home/user"
 *             required:
 *               - command
 *     responses:
 *       200:
 *         description: Bash command executed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 output:
 *                   type: string
 *                   description: The standard output from the executed bash command.
 *                   example: "total 8\ndrwxr-xr-x 2 user user 4096 Oct 27 10:00 .\ndrwxr-xr-x 3 root root 4096 Oct 27 09:55 .."
 *                 message:
 *                   type: string
 *                   example: "Bash command executed successfully."
 *       400:
 *         description: Bad request, invalid command or execution failed within the instance.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cyberdesk instance not found with the provided ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error during bash command execution.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/bash/:id', catchAsync(cyberdeskController.bash));

/**
 * @swagger
 * /api/cyberdesk/terminate/{id}:
 *   delete:
 *     summary: Terminate a specific Cyberdesk instance.
 *     description: Shuts down and de-provisions a Cyberdesk instance identified by its ID.
 *     tags: [Cyberdesk]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique ID of the Cyberdesk instance to terminate.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       204:
 *         description: Cyberdesk instance terminated successfully (No Content).
 *       404:
 *         description: Cyberdesk instance not found with the provided ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error during Cyberdesk instance termination.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/terminate/:id', catchAsync(cyberdeskController.terminate));

// =================================================================
// Platform Owner / Super Admin Routes
// =================================================================

/**
 * @swagger
 * tags:
 *   name: Platform Owner
 *   description: API for global platform administration and tenant management. Requires Super Admin privileges.
 */

/**
 * @swagger
 * /api/cyberdesk/admin/tenants:
 *   get:
 *     summary: List all tenants on the platform.
 *     description: Retrieves a paginated list of all tenants, including their status and basic information.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: The number of tenants to return per page.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, all]
 *           default: all
 *         description: Filter tenants by their status.
 *     responses:
 *       200:
 *         description: A list of tenants.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/admin/tenants', catchAsync(cyberdeskController.adminListTenants));

/**
 * @swagger
 * /api/cyberdesk/admin/tenants/{tenantId}/suspend:
 *   post:
 *     summary: Suspend a tenant.
 *     description: Marks a tenant as suspended, preventing them from launching new resources or using the platform.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to suspend.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: The reason for the suspension (for audit logging).
 *                 example: "Violation of terms of service."
 *     responses:
 *       200:
 *         description: Tenant suspended successfully.
 *       404:
 *         description: Tenant not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/admin/tenants/:tenantId/suspend', catchAsync(cyberdeskController.adminSuspendTenant));

/**
 * @swagger
 * /api/cyberdesk/admin/tenants/{tenantId}/unsuspend:
 *   post:
 *     summary: Unsuspend a tenant.
 *     description: Re-activates a suspended tenant, restoring their access to the platform.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to unsuspend.
 *     responses:
 *       200:
 *         description: Tenant unsuspended successfully.
 *       404:
 *         description: Tenant not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/admin/tenants/:tenantId/unsuspend', catchAsync(cyberdeskController.adminUnsuspendTenant));

/**
 * @swagger
 * /api/cyberdesk/admin/tenants/{tenantId}/limits:
 *   put:
 *     summary: Override a tenant's resource limits.
 *     description: Allows a Platform Owner to set or override specific resource limits for a single tenant.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant whose limits are being updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxInstances:
 *                 type: integer
 *                 description: The maximum number of concurrent Cyberdesk instances the tenant can run.
 *                 example: 50
 *               maxCpuPerInstance:
 *                 type: integer
 *                 description: The maximum CPU cores allowed per instance.
 *                 example: 8
 *     responses:
 *       200:
 *         description: Tenant limits updated successfully.
 *       400:
 *         description: Invalid limit values provided.
 *       404:
 *         description: Tenant not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/admin/tenants/:tenantId/limits', catchAsync(cyberdeskController.adminOverrideTenantLimits));

/**
 * @swagger
 * /api/cyberdesk/admin/stats:
 *   get:
 *     summary: Get global platform statistics.
 *     description: Retrieves system-wide statistics for global oversight.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Global statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTenants:
 *                   type: integer
 *                   example: 150
 *                 activeTenants:
 *                   type: integer
 *                   example: 145
 *                 totalInstances:
 *                   type: integer
 *                   example: 876
 *                 runningInstances:
 *                   type: integer
 *                   example: 750
 *                 platformResourceUsage:
 *                   type: object
 *                   properties:
 *                     cpu:
 *                       type: string
 *                       example: "75%"
 *                     memory:
 *                       type: string
 *                       example: "68%"
 *       500:
 *         description: Internal server error.
 */
router.get('/admin/stats', catchAsync(cyberdeskController.adminGetGlobalStats));

/**
 * @swagger
 * /api/cyberdesk/admin/config:
 *   get:
 *     summary: Get system-wide configuration.
 *     description: Retrieves the current global configuration settings for the platform.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System configuration retrieved successfully.
 *       500:
 *         description: Internal server error.
 *   put:
 *     summary: Update system-wide configuration.
 *     description: Allows a Platform Owner to update global configuration settings.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultTenantLimits:
 *                 type: object
 *                 properties:
 *                   maxInstances:
 *                     type: integer
 *                     example: 10
 *               maintenanceMode:
 *                 type: boolean
 *                 example: false
 *               featureFlags:
 *                 type: object
 *                 example: { "newDashboard": true, "apiV2Enabled": false }
 *     responses:
 *       200:
 *         description: System configuration updated successfully.
 *       400:
 *         description: Invalid configuration values provided.
 *       500:
 *         description: Internal server error.
 */
router.route('/admin/config')
  .get(catchAsync(cyberdeskController.adminGetConfig))
  .put(catchAsync(cyberdeskController.adminUpdateConfig));

/**
 * @swagger
 * /api/cyberdesk/admin/logs:
 *   get:
 *     summary: Retrieve global system logs.
 *     description: Fetches system-wide logs, such as audit trails or critical errors, for administrative review.
 *     tags: [Platform Owner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: The number of log entries to return per page.
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error, audit]
 *         description: Filter logs by level.
 *     responses:
 *       200:
 *         description: A list of log entries.
 *       500:
 *         description: Internal server error.
 */
router.get('/admin/logs', catchAsync(cyberdeskController.adminGetGlobalLogs));

/**
 * Exports the Express router for Cyberdesk routes.
 * This router should be mounted under a base path, e.g., `/api/cyberdesk`.
 * @type {express.Router}
 */
export const cyberdeskRoutes = router;