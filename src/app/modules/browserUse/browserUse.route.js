import express from 'express';
import { BrowserUseController } from './browserUse.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { requireRole } from '../../middlewares/auth/requireRole.js'; // Middleware to enforce role-based access

/**
 * @constant {express.Router} router - Express router instance for browser use AI routes.
 */
const router = express.Router();

// --- USER & TENANT-SCOPED ROUTES ---
// These routes are for regular users and are scoped to their tenant.
// The middleware chain ensures authentication and that the operation is within the user's tenant context.

/**
 * @swagger
 * /api/browser-use/task:
 *   post:
 *     summary: Initiates a new browser automation task.
 *     description: Creates and starts a new browser automation task based on the provided instructions and context. This operation is tenant-scoped.
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
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/task',
  auth(),
  extractTenantContext,
  BrowserUseController.runTaskController
);

/**
 * @swagger
 * /api/browser-use/status/{sessionId}/{taskId}:
 *   get:
 *     summary: Retrieves the status of a specific browser automation task.
 *     description: Fetches the current status and any available results for a given browser automation task within the user's session and tenant.
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
 *         description: Unauthorized, authentication token missing or invalid.
 *       404:
 *         description: Session or task not found.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/status/:sessionId/:taskId',
  auth(),
  extractTenantContext,
  BrowserUseController.getTaskStatusController
);

/**
 * @swagger
 * /api/browser-use/sessions/{userId}:
 *   get:
 *     summary: Retrieves all browser automation sessions for a specific user.
 *     description: Fetches a list of all historical browser automation sessions associated with the given user ID within the current tenant. The requesting user must have permission to view the target user's data.
 *     tags:
 *       - Browser Use AI (User)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose sessions are to be retrieved.
 *         example: "user_12345"
 *     responses:
 *       200:
 *         description: User sessions retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found or no sessions for the user.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/sessions/:userId',
  auth(),
  extractTenantContext,
  BrowserUseController.getUserSessionsController
);

/**
 * @swagger
 * /api/browser-use/session/{sessionId}/{userId}:
 *   get:
 *     summary: Retrieves a specific browser automation session by ID for a user.
 *     description: Fetches detailed information about a single browser automation session, including its tasks and results, for a given user within the current tenant.
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
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user who owns the session.
 *         example: "user_12345"
 *     responses:
 *       200:
 *         description: Session details retrieved successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Session not found for the given user.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/session/:sessionId/:userId',
  auth(),
  extractTenantContext,
  BrowserUseController.getSessionByIdController
);

// --- PLATFORM OWNER / SUPER ADMIN ROUTES ---
// These routes provide global oversight and are NOT tenant-scoped.
// Access is restricted to users with the 'platform_owner' role.

/**
 * @swagger
 * /api/browser-use/platform/sessions:
 *   get:
 *     summary: (Platform Owner) List all browser sessions across the platform.
 *     description: Retrieves a paginated list of all browser automation sessions across all tenants. Supports filtering by tenant ID, user ID, and status.
 *     tags:
 *       - Browser Use AI (Platform Owner)
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
 *         description: Forbidden. User is not a Platform Owner.
 */
router.get(
  '/platform/sessions',
  auth(),
  requireRole('platform_owner'),
  BrowserUseController.getAllSessionsForPlatformController
);

/**
 * @swagger
 * /api/browser-use/platform/sessions/{sessionId}:
 *   get:
 *     summary: (Platform Owner) Get any session by ID.
 *     description: Retrieves the full details of a specific browser automation session by its ID, regardless of the tenant.
 *     tags:
 *       - Browser Use AI (Platform Owner)
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
 *         description: Forbidden. User is not a Platform Owner.
 *       404:
 *         description: Session not found.
 */
router.get(
  '/platform/sessions/:sessionId',
  auth(),
  requireRole('platform_owner'),
  BrowserUseController.getSessionByIdForPlatformController
);

/**
 * @swagger
 * /api/browser-use/platform/sessions/{sessionId}/terminate:
 *   post:
 *     summary: (Platform Owner) Terminate a running session.
 *     description: Forcefully terminates a running browser automation session. This is an administrative action to stop runaway or stuck processes.
 *     tags:
 *       - Browser Use AI (Platform Owner)
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
 *         description: Forbidden. User is not a Platform Owner.
 *       404:
 *         description: Session not found or already completed.
 */
router.post(
  '/platform/sessions/:sessionId/terminate',
  auth(),
  requireRole('platform_owner'),
  BrowserUseController.terminateSessionForPlatformController
);

/**
 * @swagger
 * /api/browser-use/platform/stats:
 *   get:
 *     summary: (Platform Owner) Get global platform statistics.
 *     description: Retrieves system-wide statistics for the Browser Use AI module, such as total sessions, active sessions, tasks completed, error rates, and usage by tenant.
 *     tags:
 *       - Browser Use AI (Platform Owner)
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
 *         description: Forbidden. User is not a Platform Owner.
 */
router.get(
  '/platform/stats',
  auth(),
  requireRole('platform_owner'),
  BrowserUseController.getPlatformStatsController
);

/**
 * @exports {express.Router} browserUseAiRoutes - The Express router configured with browser use AI routes.
 */
export const browserUseAiRoutes = router;