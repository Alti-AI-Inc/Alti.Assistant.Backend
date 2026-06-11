import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { Llama4AiController } from './llama4.controller.js';
import catchAsync from '../../../shared/catchAsync.js';
// Platform Owner Feature: Import a dedicated controller for platform management.
// NOTE: This controller is assumed to exist and contain the necessary business logic.
import { PlatformController } from './platform.controller.js';

/**
 * @constant {express.Router} router - Express router for Llama4 AI and Platform Management routes.
 * @description This router handles both the core AI interaction endpoints and the platform-level administrative endpoints.
 * NOTE: For better separation of concerns, platform management routes could be moved to a dedicated `platform.route.js` file in a future refactor.
 */
const router = express.Router();

// =================================================================
// Llama4 AI Core Routes
// =================================================================

/**
 * @swagger
 * /api/v1/llama4/get-response:
 *   post:
 *     summary: Get a response from the Llama4 AI model.
 *     description: Sends a text prompt to the Llama4 AI model and retrieves a generated response.
 *                  This endpoint requires authentication with PLATFORM_OWNER, ADMIN, or USER roles.
 *     tags:
 *       - Llama4 AI
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
 *                 description: The text prompt to send to the Llama4 AI model.
 *                 example: "Explain the concept of quantum entanglement in simple terms."
 *     responses:
 *       200:
 *         description: AI response successfully retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The generated response from the Llama4 AI.
 *                       example: "Quantum entanglement is a phenomenon where two or more particles become linked..."
 *       400:
 *         description: Bad Request - Invalid prompt or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid.
 *       403:
 *         description: Forbidden - User does not have the necessary roles.
 *       500:
 *         description: Internal Server Error.
 */
router.post(
  '/get-response',
  // Platform Owner Enhancement: Grant PLATFORM_OWNER access to all core functionalities.
  auth(
    ENUM_USER_ROLE.PLATFORM_OWNER,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.USER
  ),
  // Wrap the async controller to ensure any uncaught exceptions are passed to the global error handler.
  catchAsync(Llama4AiController.Llama4AiGetResponse)
);

// =================================================================
// Platform Owner / Super Admin Routes
// =================================================================

// --- Tenant Management ---

/**
 * @swagger
 * /api/v1/llama4/platform/tenants:
 *   get:
 *     summary: List all tenants (Platform Owner)
 *     description: Retrieves a comprehensive list of all tenants in the platform, including their status, limits, and other metadata. Restricted to Platform Owners for global oversight.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of all tenants.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get(
  '/platform/tenants',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.getAllTenants)
);

/**
 * @swagger
 * /api/v1/llama4/platform/tenants/{id}/suspend:
 *   post:
 *     summary: Suspend a tenant account (Platform Owner)
 *     description: Marks a tenant as suspended, preventing them from accessing the service. This is a critical administrative action. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant to suspend.
 *     responses:
 *       200:
 *         description: Tenant suspended successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Tenant not found.
 */
router.post(
  '/platform/tenants/:id/suspend',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.suspendTenant)
);

/**
 * @swagger
 * /api/v1/llama4/platform/tenants/{id}/unsuspend:
 *   post:
 *     summary: Unsuspend a tenant account (Platform Owner)
 *     description: Re-activates a suspended tenant account, restoring their access to the service. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant to unsuspend.
 *     responses:
 *       200:
 *         description: Tenant unsuspended successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Tenant not found.
 */
router.post(
  '/platform/tenants/:id/unsuspend',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.unsuspendTenant)
);

/**
 * @swagger
 * /api/v1/llama4/platform/tenants/{id}/limits:
 *   put:
 *     summary: Override a tenant's usage limits (Platform Owner)
 *     description: Allows a Platform Owner to set custom usage limits for a specific tenant, overriding any default plan limits. This provides granular control over tenant resources.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant whose limits are to be overridden.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxApiRequestsPerMonth:
 *                 type: integer
 *                 description: The maximum number of API requests the tenant can make per month.
 *                 example: 1000000
 *               maxUsers:
 *                 type: integer
 *                 description: The maximum number of users the tenant can have.
 *                 example: 500
 *               customFeatureFlag:
 *                 type: boolean
 *                 description: A custom feature flag for this tenant.
 *                 example: true
 *     responses:
 *       200:
 *         description: Tenant limits updated successfully.
 *       400:
 *         description: Bad Request - Invalid limit values provided.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Tenant not found.
 */
router.put(
  '/platform/tenants/:id/limits',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.overrideTenantLimits)
);

/**
 * @swagger
 * /api/v1/llama4/platform/tenants/{id}:
 *   delete:
 *     summary: Delete a tenant account (Platform Owner)
 *     description: Permanently deletes a tenant and all associated data. This is an irreversible action and should be used with extreme caution. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant to delete.
 *     responses:
 *       204:
 *         description: Tenant deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Tenant not found.
 */
router.delete(
  '/platform/tenants/:id',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.deleteTenant)
);

/**
 * @swagger
 * /api/v1/llama4/platform/tenants/{tenantId}/users/{userId}/impersonate:
 *   post:
 *     summary: Impersonate a user within a tenant (Platform Owner)
 *     description: Generates a short-lived authentication token for a specific user, allowing the Platform Owner to log in as that user for debugging and support purposes. This action should be heavily audited. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the tenant.
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the user to impersonate.
 *     responses:
 *       200:
 *         description: Impersonation token generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: A temporary JWT token to be used for impersonation.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Tenant or User not found.
 */
router.post(
  '/platform/tenants/:tenantId/users/:userId/impersonate',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.impersonateUser)
);

// --- System-wide Configuration ---

/**
 * @swagger
 * /api/v1/llama4/platform/config:
 *   get:
 *     summary: Get system-wide configuration (Platform Owner)
 *     description: Retrieves the global platform configuration settings, such as API keys for third-party services, feature flags, and maintenance mode status. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System configuration object.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get(
  '/platform/config',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.getSystemConfig)
);

/**
 * @swagger
 * /api/v1/llama4/platform/config:
 *   put:
 *     summary: Update system-wide configuration (Platform Owner)
 *     description: Allows a Platform Owner to modify global platform settings. This is a high-privilege operation and should be used with caution.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maintenanceMode:
 *                 type: boolean
 *                 description: Enable or disable platform-wide maintenance mode.
 *               defaultTenantPlan:
 *                 type: string
 *                 description: The default plan assigned to new tenants.
 *                 example: "standard"
 *               externalLlama4ApiKey:
 *                 type: string
 *                 description: The API key for the external Llama4 service.
 *                 example: "sk-..."
 *     responses:
 *       200:
 *         description: System configuration updated successfully.
 *       400:
 *         description: Bad Request - Invalid configuration values provided.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.put(
  '/platform/config',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.updateSystemConfig)
);

// --- Platform Communication ---

/**
 * @swagger
 * /api/v1/llama4/platform/broadcast:
 *   post:
 *     summary: Send a system-wide broadcast message (Platform Owner)
 *     description: Sends a message to all active tenants or users. Useful for maintenance announcements, new feature alerts, or other important communications. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - level
 *             properties:
 *               message:
 *                 type: string
 *                 description: The content of the broadcast message.
 *                 example: "The platform will be down for scheduled maintenance on Sunday at 2 AM UTC for approximately 30 minutes."
 *               level:
 *                 type: string
 *                 enum: [info, warning, critical]
 *                 description: The severity level of the message.
 *                 example: "warning"
 *               target:
 *                 type: string
 *                 enum: [all_tenants, all_users]
 *                 description: The target audience for the broadcast. Defaults to 'all_tenants'.
 *                 example: "all_tenants"
 *     responses:
 *       200:
 *         description: Broadcast message sent successfully.
 *       400:
 *         description: Bad Request - Invalid message format.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.post(
  '/platform/broadcast',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.broadcastMessage)
);

// --- Global Oversight & Logs ---

/**
 * @swagger
 * /api/v1/llama4/platform/logs:
 *   get:
 *     summary: View global system logs (Platform Owner)
 *     description: Provides access to a paginated list of system-wide logs for auditing and debugging purposes. Can be filtered by log level, tenant, user, and time range. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
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
 *         description: The number of log entries per page.
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error, debug]
 *         description: Filter logs by severity level.
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filter logs by a specific tenant ID.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter logs by a specific user ID.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: The start of the time range to filter logs (ISO 8601 format).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: The end of the time range to filter logs (ISO 8601 format).
 *     responses:
 *       200:
 *         description: A paginated list of global log entries.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get(
  '/platform/logs',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.getGlobalLogs)
);

/**
 * @swagger
 * /api/v1/llama4/platform/stats:
 *   get:
 *     summary: View global platform statistics (Platform Owner)
 *     description: Retrieves high-level statistics for the entire platform, such as total tenants, active users, API usage, and system health metrics. Restricted to Platform Owners.
 *     tags:
 *       - Platform Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: An object containing global platform statistics.
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
 *                 totalUsers:
 *                   type: integer
 *                   example: 2340
 *                 apiCallsLast24h:
 *                   type: integer
 *                   example: 87654
 *                 systemHealth:
 *                   type: string
 *                   example: "OK"
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get(
  '/platform/stats',
  auth(ENUM_USER_ROLE.PLATFORM_OWNER),
  catchAsync(PlatformController.getGlobalStats)
);

/**
 * @exports {express.Router} llama4AiRoutes - The Express router for Llama4 AI and Platform Management related API endpoints.
 */
export const llama4AiRoutes = router;