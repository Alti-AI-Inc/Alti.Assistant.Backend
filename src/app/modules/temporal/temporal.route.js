import express from 'express';
import { TemporalController } from './temporal.controller.js';
import auth from '../../middlewares/auth/auth.js';

/**
 * @constant {express.Router} router - The Express router instance for handling Temporal API routes.
 */
const router = express.Router();

// All Temporal endpoints are strictly secured under JWT authorization

/**
 * @swagger
 * /temporal/repositories:
 *   get:
 *     summary: Retrieve a list of Temporal repositories.
 *     description: Fetches a comprehensive list of all configured Temporal repositories, including their names, types, and current operational statuses. This endpoint requires JWT authentication.
 *     tags:
 *       - Temporal
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved the list of repositories.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: Unique identifier for the repository.
 *                     example: "repo123"
 *                   name:
 *                     type: string
 *                     description: Name of the repository.
 *                     example: "MyWorkflowRepo"
 *                   type:
 *                     type: string
 *                     description: Type of the repository (e.g., 'Git', 'S3').
 *                     example: "Git"
 *                   status:
 *                     type: string
 *                     description: Current operational status of the repository.
 *                     example: "Active"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/repositories', auth(), TemporalController.getRepositories);

/**
 * @swagger
 * /temporal/stats:
 *   get:
 *     summary: Get Temporal system statistics.
 *     description: Retrieves various operational statistics about the Temporal system, such as active workflow counts, task queue health, worker statuses, and overall system performance metrics. This endpoint requires JWT authentication.
 *     tags:
 *       - Temporal
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved Temporal system statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 activeWorkflows:
 *                   type: integer
 *                   description: Number of currently active workflows.
 *                   example: 150
 *                 completedWorkflows:
 *                   type: integer
 *                   description: Total number of completed workflows.
 *                   example: 12345
 *                 failedWorkflows:
 *                   type: integer
 *                   description: Total number of failed workflows.
 *                   example: 23
 *                 taskQueues:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: Name of the task queue.
 *                         example: "default-queue"
 *                       pendingTasks:
 *                         type: integer
 *                         description: Number of tasks currently pending in the queue.
 *                         example: 5
 *                       workers:
 *                         type: integer
 *                         description: Number of workers connected to this task queue.
 *                         example: 3
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/stats', auth(), TemporalController.getStats);

/**
 * @swagger
 * /temporal/sync:
 *   post:
 *     summary: Initiate synchronization of the Temporal catalog.
 *     description: Triggers a synchronization process for the Temporal catalog. This operation updates the catalog with the latest information from all connected repositories, which might include new workflows, activities, or changes to existing ones. This can be a long-running operation. This endpoint requires JWT authentication.
 *     tags:
 *       - Temporal
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 description: If true, forces a full resync even if no changes are detected.
 *                 default: false
 *           example:
 *             force: true
 *     responses:
 *       200:
 *         description: Synchronization process initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Temporal catalog synchronization initiated."
 *                 syncId:
 *                   type: string
 *                   description: Optional ID for tracking the synchronization process.
 *                   example: "sync_abc123"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/sync', auth(), TemporalController.syncCatalog);

/**
 * @exports {express.Router} temporalRoutes - The Express router containing all Temporal API routes.
 * This router should be mounted under a base path, e.g., `/temporal`.
 */
export const temporalRoutes = router;