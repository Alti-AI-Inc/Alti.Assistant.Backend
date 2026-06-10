import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import { TemporalController } from './temporal.controller.js';
import auth from '../../middlewares/auth/auth.js';

// Initialize Google Cloud Pub/Sub client.
// Ensure your environment is authenticated, e.g., via GOOGLE_APPLICATION_CREDENTIALS
// or by running on a GCP service with appropriate permissions.
const pubSubClient = new PubSub();

// The name of the Pub/Sub topic to which sync requests will be published.
// It's recommended to configure this via environment variables.
const syncTopicName = process.env.TEMPORAL_SYNC_TOPIC || 'temporal-catalog-sync-requests';

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
 *     summary: Request synchronization of the Temporal catalog.
 *     description: Triggers an asynchronous background job to synchronize the Temporal catalog. This operation updates the catalog with the latest information from all connected repositories. Since this can be a long-running operation, the request is queued via Google Cloud Pub/Sub and processed by a background worker. This endpoint requires JWT authentication.
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
 *       202:
 *         description: Synchronization request accepted and queued for processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Temporal catalog synchronization request accepted and queued for processing."
 *                 messageId:
 *                   type: string
 *                   description: The unique ID of the message published to the Pub/Sub topic.
 *                   example: "1234567890123456"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/sync', auth(), async (req, res, next) => {
  try {
    // This is a long-running operation and must not be handled in-memory within the request-response cycle.
    // We offload the synchronization task to a background worker via Google Cloud Pub/Sub.
    const { force } = req.body;
    const payload = {
      force: force || false,
      // Assuming the auth middleware attaches user information to the request object.
      requestedBy: req.user ? req.user.id : 'unknown',
      requestTimestamp: new Date().toISOString(),
    };

    const dataBuffer = Buffer.from(JSON.stringify(payload));

    // Publish the message to the specified Pub/Sub topic.
    // A separate background service (e.g., a Cloud Function, Cloud Run service)
    // must be subscribed to this topic to perform the actual sync logic from TemporalController.syncCatalog.
    const messageId = await pubSubClient.topic(syncTopicName).publishMessage({ data: dataBuffer });

    // Respond immediately to the client with a 202 Accepted status,
    // confirming the task has been successfully queued.
    res.status(202).json({
      message: 'Temporal catalog synchronization request accepted and queued for processing.',
      messageId: messageId,
    });
  } catch (error) {
    // Log the error and pass it to the Express error handling middleware.
    console.error(`Failed to publish sync request to Pub/Sub topic '${syncTopicName}':`, error);
    // Provide a user-friendly error message.
    const serviceError = new Error('Failed to queue the synchronization task. Please try again later.');
    serviceError.statusCode = 500;
    next(serviceError);
  }
});

/**
 * @exports {express.Router} temporalRoutes - The Express router containing all Temporal API routes.
 * This router should be mounted under a base path, e.g., `/temporal`.
 */
export const temporalRoutes = router;