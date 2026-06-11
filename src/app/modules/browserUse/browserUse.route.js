import express from 'express';
import { BrowserUseController } from './browserUse.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { requireRole } from '../../middlewares/auth/requireRole.js'; // Middleware to enforce role-based access
import catchAsync from '../../utils/catchAsync.js'; // Utility to catch errors from async express handlers

/**
 * @constant {express.Router} router - Express router instance for browser use AI routes.
 */
const router = express.Router();

// --- USER ROUTES (Self-service) ---
// These routes are for regular users to manage their own resources.
// They are authenticated and scoped to the user's tenant context.

/**
 * @swagger
 * /api/browser-use/task:
 *   post:
 *     summary: Initiates a new browser automation task.
 *     description: Creates and starts a new browser automation task for the authenticated user. This operation is tenant-scoped and subject to usage limits.
 *     tags:
 *       - Browser Use AI (User)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskType
 *               - url
 *               - instructions
 *             properties:
 *               taskType:
 *                 type: string
 *                 description: The type of browser automation task (e.g., 'scrape', 'navigate', 'interact').
 *                 example: "scrape"
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: The starting URL for the browser automation.
 *                 example: "https://example.com"
 *               instructions:
 *                 type: string
 *                 description: Detailed instructions for the browser automation task.
 *                 example: "Navigate to the pricing page and extract all plan names and their prices."
 *               context:
 *                 type: object
 *                 description: Additional context or data needed for the task.
 *                 example: { "userPreferences": { "theme": "dark" } }
 *     responses:
 *       200:
 *         description: Task initiated successfully. Returns the session and task IDs.
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
 *                   example: "Browser automation task initiated."
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       description: The ID of the browser session.
 *                       example: "sess_abc123"
 *                     taskId:
 *                       type: string
 *                       description: The ID of the specific task within the session.
 *                       example: "task_xyz789"
 *       400:
 *         description: Bad request, invalid input.
 *       401:
 *         description: Unauthorized, authentication token missing or invalid.
 *       402:
 *         description: Payment Required. User or tenant has exceeded usage limits.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/task',
  auth(),
  extractTenantContext,
  // FIX: The controller must verify user/tenant usage limits before initiating a task.
  catchAsync(BrowserUseController.runTaskController)
);

/**
 * @swagger
 * /api/browser-use/status/{sessionId}/{taskId}:
 *   get:
 *     summary: Retrieves the status of a specific browser automation task.
 *     description: Fetches the current status for a task owned by the authenticated user.
 *     tags:
 *       - Browser Use AI (User)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the browser session.
 *         example: "sess_abc123"
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the specific task within the session.
 *         example: "task_xyz789"
 *     responses:
 *       200:
 *         description: Task status retrieved successfully.
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
 *                   example: "Task status retrieved."
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       example: "sess_abc123"
 *                     taskId:
 *                       type: string
 *                       example: "task_xyz789"
 *                     status:
 *                       type: string
 *                       description: The current status of the task (e.g., 'pending', 'running', 'completed', 'failed').
 *                       example: "completed"
 *                     progress:
 *                       type: number
 *                       description: Percentage of task completion.
 *                       example: 100
 *                     results:
 *                       type: object
 *                       description: The results generated by the task, if completed.
 *                       example: { "extractedData": [{ "name": "Plan A", "price": "$10" }] }
 *                     error:
 *                       type: string
 *                       description: Error message if the task failed.
 *                       example: null
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. The user does not own this task.
 *       404:
 *         description: Session or task not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/status/:sessionId/:taskId',
  auth(),
  extractTenantContext,
  // FIX: The controller must validate that the requested session/task belongs to the authenticated user (req.user.id).
  catchAsync(BrowserUseController.getTaskStatusController)
);

/**
 * @swagger
 * /api/browser-use/sessions/me:
 *   get:
 *     summary: Retrieves all browser automation sessions for the authenticated user.
 *     description: Fetches a list of all historical browser automation sessions for the currently authenticated user.
 *     tags:
 *       - Browser Use AI (User)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User sessions retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/sessions/me',
  // FIX: Patched IDOR vulnerability. Route is changed from '/sessions/:userId' to '/sessions/me'.
  // The controller will now use the authenticated user's ID from the token (req.user.id) instead of a path parameter.
  // This prevents one user from accessing another user's session list.
  auth(),
  extractTenantContext,
  catchAsync(BrowserUseController.getMySessionsController)
);

/**
 * @swagger
 * /api/browser-use/session/{sessionId}:
 *   get:
 *     summary: Retrieves a specific browser automation session by ID.
 *     description: Fetches detailed information about a single browser automation session owned by the authenticated user.
 *     tags:
 *       - Browser Use AI (User)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the browser session to retrieve.
 *         example: "sess_abc123"
 *     responses:
 *       200:
 *         description: Session details retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. The user does not own this session.
 *       404:
 *         description: Session not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/session/:sessionId',
  // FIX: Patched IDOR vulnerability. Removed the insecure ':userId' parameter.
  // The controller must now validate that the requested session belongs to the authenticated user (req.user.id).
  auth(),
  extractTenantContext,
  catchAsync(BrowserUseController.getSessionByIdForUserController)
);

// --- ADMIN & MANAGER ROUTES (Tenant-scoped management) ---
// These routes are for workspace admins and managers to oversee their teams and tenants.
// Access is restricted by role and is always confined within the requester's tenant.

/**
 * @swagger
 * /api/browser-use/admin/sessions/user/{userId}:
 *   get:
 *     summary: (Admin/Manager) Get sessions for a specific user.
 *     description: Fetches sessions for a specific user. Admins can view any user in their tenant. Managers can only view users they directly manage.
 *     tags:
 *       - Browser Use AI (Admin & Manager)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose sessions are to be retrieved.
 *     responses:
 *       200:
 *         description: User sessions retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Requester does not have permission to view this user's data.
 *       404:
 *         description: User not found within the manager's team or admin's tenant.
 */
router.get(
  '/admin/sessions/user/:userId',
  // INTEGRATION: Added a new route for hierarchical access.
  // Requires 'admin' or 'manager' role.
  // The controller must perform a secondary check:
  // 1. If role is 'admin', ensure target userId is in the same tenant.
  // 2. If role is 'manager', ensure target userId is a direct report.
  auth(),
  extractTenantContext,
  requireRole('admin', 'manager'),
  catchAsync(BrowserUseController.getSessionsForUserByAdminManager)
);

/**
 * @swagger
 * /api/browser-use/admin/sessions:
 *   get:
 *     summary: (Admin) Get all sessions within the tenant.
 *     description: Fetches a paginated list of all browser automation sessions for all users within the admin's tenant.
 *     tags:
 *       - Browser Use AI (Admin & Manager)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of all sessions in the tenant.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a tenant admin.
 */
router.get(
  '/admin/sessions',
  // INTEGRATION: Added a new route for tenant-wide oversight by admins.
  auth(),
  extractTenantContext,
  requireRole('admin'),
  catchAsync(BrowserUseController.getAllSessionsForTenant)
);

/**
 * @swagger
 * /api/browser-use/admin/session/{sessionId}/terminate:
 *   post:
 *     summary: (Admin) Terminate a running session within the tenant.
 *     description: Forcefully terminates a running browser automation session within the admin's tenant.
 *     tags:
 *       - Browser Use AI (Admin & Manager)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the session to terminate.
 *     responses:
 *       200:
 *         description: Session terminated successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a tenant admin or session is not in their tenant.
 *       404:
 *         description: Session not found or already completed.
 */
router.post(
  '/admin/session/:sessionId/terminate',
  // INTEGRATION: Added a new route for tenant-level administrative actions.
  auth(),
  extractTenantContext,
  requireRole('admin'),
  catchAsync(BrowserUseController.terminateSessionForAdmin)
);

/**
 * @swagger
 * /api/browser-use/admin/stats:
 *   get:
 *     summary: (Admin) Get usage statistics for the tenant.
 *     description: Retrieves usage statistics for the Browser Use AI module within the admin's tenant.
 *     tags:
 *       - Browser Use AI (Admin & Manager)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant-wide statistics.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a tenant admin.
 */
router.get(
  '/admin/stats',
  // INTEGRATION: Added a new route for tenant-level usage monitoring.
  auth(),
  extractTenantContext,
  requireRole('admin'),
  catchAsync(BrowserUseController.getTenantStats)
);

// --- SUPER ADMIN ROUTES ---
// These routes provide global oversight and are NOT tenant-scoped.
// Access is restricted to users with the 'super_admin' role.

/**
 * @swagger
 * /api/browser-use/platform/sessions:
 *   get:
 *     summary: (Super Admin) List all browser sessions across the platform.
 *     description: Retrieves a paginated list of all browser automation sessions across all tenants. Supports filtering by tenant ID, user ID, and status.
 *     tags:
 *       - Browser Use AI (Super Admin)
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
 *         description: The number of items per page.
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Optional. Filter sessions by a specific tenant ID.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional. Filter sessions by a specific user ID.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, completed, failed, terminated]
 *         description: Optional. Filter sessions by status.
 *     responses:
 *       200:
 *         description: A list of all sessions on the platform.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router.get(
  '/platform/sessions',
  auth(),
  // FIX: Standardized role name to 'super_admin' for consistency.
  requireRole('super_admin'),
  catchAsync(BrowserUseController.getAllSessionsForSuperAdmin)
);

/**
 * @swagger
 * /api/browser-use/platform/sessions/{sessionId}:
 *   get:
 *     summary: (Super Admin) Get any session by ID.
 *     description: Retrieves the full details of a specific browser automation session by its ID, regardless of the tenant.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the session to retrieve.
 *     responses:
 *       200:
 *         description: Detailed information about the session.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 *       404:
 *         description: Session not found.
 */
router.get(
  '/platform/sessions/:sessionId',
  auth(),
  // FIX: Standardized role name to 'super_admin' for consistency.
  requireRole('super_admin'),
  catchAsync(BrowserUseController.getSessionByIdForSuperAdmin)
);

/**
 * @swagger
 * /api/browser-use/platform/sessions/{sessionId}/terminate:
 *   post:
 *     summary: (Super Admin) Terminate a running session.
 *     description: Forcefully terminates a running browser automation session. This is an administrative action to stop runaway or stuck processes.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the session to terminate.
 *     responses:
 *       200:
 *         description: Session terminated successfully.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 *       404:
 *         description: Session not found or already completed.
 */
router.post(
  '/platform/sessions/:sessionId/terminate',
  auth(),
  // FIX: Standardized role name to 'super_admin' for consistency.
  requireRole('super_admin'),
  catchAsync(BrowserUseController.terminateSessionForSuperAdmin)
);

/**
 * @swagger
 * /api/browser-use/platform/stats:
 *   get:
 *     summary: (Super Admin) Get global platform statistics.
 *     description: Retrieves system-wide statistics for the Browser Use AI module, such as total sessions, active sessions, tasks completed, error rates, and usage by tenant.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform-wide statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalSessions:
 *                       type: integer
 *                     activeSessions:
 *                       type: integer
 *                     completedTasksToday:
 *                       type: integer
 *                     failedTasksToday:
 *                       type: integer
 *                     errorRate:
 *                       type: number
 *                       format: float
 *                     topTenantsByUsage:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tenantId:
 *                             type: string
 *                           sessionCount:
 *                             type: integer
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router.get(
  '/platform/stats',
  auth(),
  // FIX: Standardized role name to 'super_admin' for consistency.
  requireRole('super_admin'),
  catchAsync(BrowserUseController.getPlatformStatsForSuperAdmin)
);

/**
 * @swagger
 * /api/browser-use/platform/task/run-as:
 *   post:
 *     summary: (Super Admin) Run a task as any user, bypassing limits.
 *     description: Initiates a browser automation task on behalf of a specified user within a specified tenant. This endpoint is for administrative and diagnostic purposes and bypasses all standard usage and concurrency limits.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *               - userId
 *               - task
 *             properties:
 *               tenantId:
 *                 type: string
 *                 description: The ID of the tenant to run the task under.
 *                 example: "tenant_123"
 *               userId:
 *                 type: string
 *                 description: The ID of the user to impersonate for this task.
 *                 example: "user_456"
 *               task:
 *                 type: object
 *                 description: The task payload, same as the user-facing /task endpoint.
 *                 properties:
 *                   taskType:
 *                     type: string
 *                     example: "scrape"
 *                   url:
 *                     type: string
 *                     format: uri
 *                     example: "https://example.com/debug"
 *                   instructions:
 *                     type: string
 *                     example: "Run diagnostics on this page."
 *     responses:
 *       200:
 *         description: Task initiated successfully under the specified user context.
 *       400:
 *         description: Bad request, invalid input, or target user/tenant not found.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router.post(
  '/platform/task/run-as',
  // INTEGRATION: Added endpoint for Super Admins to run tasks on behalf of users, bypassing limits.
  auth(),
  requireRole('super_admin'),
  catchAsync(BrowserUseController.runTaskAsSuperAdmin)
);

/**
 * @swagger
 * /api/browser-use/platform/config:
 *   get:
 *     summary: (Super Admin) Get platform-wide module configuration.
 *     description: Retrieves the global configuration settings for the Browser Use AI module, such as max concurrent sessions, default timeouts, enabled features, and third-party API keys.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current platform configuration.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 *   put:
 *     summary: (Super Admin) Update platform-wide module configuration.
 *     description: Updates the global configuration settings for the Browser Use AI module. Only include the keys that need to be changed.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxGlobalConcurrentSessions:
 *                 type: integer
 *                 description: The maximum number of browser sessions allowed to run simultaneously across the entire platform.
 *                 example: 100
 *               defaultSessionTimeoutSeconds:
 *                 type: integer
 *                 description: The default timeout in seconds for an idle session before it's automatically terminated.
 *                 example: 1800
 *               allowedTaskTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: A list of task types that are enabled on the platform (e.g., 'scrape', 'interact').
 *                 example: ["scrape", "interact", "navigate"]
 *     responses:
 *       200:
 *         description: Configuration updated successfully.
 *       400:
 *         description: Bad request, invalid configuration values.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router
  .route('/platform/config')
  // INTEGRATION: Added endpoints for Super Admins to get and set global module configuration.
  .get(
    auth(),
    requireRole('super_admin'),
    catchAsync(BrowserUseController.getPlatformConfig)
  )
  .put(
    auth(),
    requireRole('super_admin'),
    catchAsync(BrowserUseController.updatePlatformConfig)
  );

/**
 * @swagger
 * /api/browser-use/platform/tenants/{tenantId}/suspend:
 *   post:
 *     summary: (Super Admin) Suspend a tenant's access to this module.
 *     description: Prevents all users within a specific tenant from initiating new browser automation tasks. Existing running tasks are allowed to complete.
 *     tags:
 *       - Browser Use AI (Super Admin)
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: The reason for the suspension, which will be logged.
 *                 example: "Violation of terms of service."
 *     responses:
 *       200:
 *         description: Tenant access to the module has been suspended.
 *       400:
 *         description: Tenant is already suspended or does not exist.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router.post(
  '/platform/tenants/:tenantId/suspend',
  // INTEGRATION: Added endpoint for Super Admins to suspend a tenant's access to this module.
  auth(),
  requireRole('super_admin'),
  catchAsync(BrowserUseController.suspendTenantModuleAccess)
);

/**
 * @swagger
 * /api/browser-use/platform/tenants/{tenantId}/unsuspend:
 *   post:
 *     summary: (Super Admin) Unsuspend a tenant's access to this module.
 *     description: Restores a tenant's ability to initiate new browser automation tasks.
 *     tags:
 *       - Browser Use AI (Super Admin)
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
 *         description: Tenant access to the module has been restored.
 *       400:
 *         description: Tenant is not currently suspended or does not exist.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router.post(
  '/platform/tenants/:tenantId/unsuspend',
  // INTEGRATION: Added endpoint for Super Admins to restore a tenant's access to this module.
  auth(),
  requireRole('super_admin'),
  catchAsync(BrowserUseController.unsuspendTenantModuleAccess)
);

/**
 * @swagger
 * /api/browser-use/platform/logs:
 *   get:
 *     summary: (Super Admin) Get global module logs.
 *     description: Retrieves a paginated list of global operational and audit logs for the Browser Use AI module. Supports filtering by log level, tenant, user, and time range.
 *     tags:
 *       - Browser Use AI (Super Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error, audit]
 *         description: Filter by log level.
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filter by a specific tenant ID.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by a specific user ID.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of the time range to query.
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of the time range to query.
 *     responses:
 *       200:
 *         description: A list of global logs.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User is not a Super Admin.
 */
router.get(
  '/platform/logs',
  // INTEGRATION: Added endpoint for Super Admins to view global logs for this module.
  auth(),
  requireRole('super_admin'),
  catchAsync(BrowserUseController.getPlatformLogs)
);

/**
 * @exports {express.Router} browserUseAiRoutes - The Express router configured with browser use AI routes.
 */
export const browserUseAiRoutes = router;