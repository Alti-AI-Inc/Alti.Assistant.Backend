import express from 'express';
import { BrowserUseController } from './browserUse.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

/**
 * @constant {express.Router} router - Express router instance for browser use AI routes.
 */
const router = express.Router();

// Apply auth and tenant context to all browser session routes
router.use(auth());
router.use(extractTenantContext);

/**
 * @swagger
 * /api/browser-use/task:
 *   post:
 *     summary: Initiates a new browser automation task.
 *     description: Creates and starts a new browser automation task based on the provided instructions and context.
 *     tags:
 *       - Browser Use AI
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized, authentication token missing or invalid.
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
router.post('/task', BrowserUseController.runTaskController);

/**
 * @swagger
 * /api/browser-use/status/{sessionId}/{taskId}:
 *   get:
 *     summary: Retrieves the status of a specific browser automation task.
 *     description: Fetches the current status and any available results for a given browser automation task within a session.
 *     tags:
 *       - Browser Use AI
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session or task not found.
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
  '/status/:sessionId/:taskId',
  BrowserUseController.getTaskStatusController
);

// --- NEW HISTORY ROUTES ---

/**
 * @swagger
 * /api/browser-use/sessions/{userId}:
 *   get:
 *     summary: Retrieves all browser automation sessions for a specific user.
 *     description: Fetches a list of all historical browser automation sessions associated with the given user ID.
 *     tags:
 *       - Browser Use AI
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
 *                   example: "User sessions retrieved."
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sessionId:
 *                         type: string
 *                         example: "sess_abc123"
 *                       userId:
 *                         type: string
 *                         example: "user_12345"
 *                       status:
 *                         type: string
 *                         example: "completed"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:00:00Z"
 *                       lastUpdated:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:15:00Z"
 *                       taskCount:
 *                         type: number
 *                         example: 2
 *       401:
 *         description: Unauthorized, authentication token missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found or no sessions for the user.
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
router.get('/sessions/:userId', BrowserUseController.getUserSessionsController);

/**
 * @swagger
 * /api/browser-use/session/{sessionId}/{userId}:
 *   get:
 *     summary: Retrieves a specific browser automation session by ID for a user.
 *     description: Fetches detailed information about a single browser automation session, including its tasks and results, for a given user.
 *     tags:
 *       - Browser Use AI
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
 *                   example: "Session details retrieved."
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       example: "sess_abc123"
 *                     userId:
 *                       type: string
 *                       example: "user_12345"
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:15:00Z"
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           taskId:
 *                             type: string
 *                             example: "task_xyz789"
 *                           taskType:
 *                             type: string
 *                             example: "scrape"
 *                           status:
 *                             type: string
 *                             example: "completed"
 *                           results:
 *                             type: object
 *                             example: { "extractedData": [{ "name": "Plan A", "price": "$10" }] }
 *                           error:
 *                             type: string
 *                             example: null
 *       401:
 *         description: Unauthorized, authentication token missing or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found for the given user.
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
  '/session/:sessionId/:userId',
  BrowserUseController.getSessionByIdController
);

/**
 * @exports {express.Router} browserUseAiRoutes - The Express router configured with browser use AI routes.
 */
export const browserUseAiRoutes = router;