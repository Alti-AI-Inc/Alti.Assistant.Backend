import express from 'express';
import writingController from './writer.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

// --- Cloud Run Lifecycle & Probes ---

const app = express();

// A flag to indicate if the server is ready to accept traffic.
// It's set to true after all startup tasks (like DB connections) are complete.
let isReady = false;

/**
 * Liveness probe endpoint (/healthz).
 * Cloud Run uses this to check if the container's server process is running.
 * A 200 OK response indicates the process is alive.
 */
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

/**
 * Readiness probe endpoint (/readyz).
 * Cloud Run uses this to check if the application is ready to serve traffic.
 * This should only return 200 OK after essential startup tasks are complete.
 * During shutdown, this will fail to signal the load balancer to stop sending new requests.
 */
app.get('/readyz', (req, res) => {
  if (isReady) {
    res.status(200).send('OK');
  } else {
    // 503 Service Unavailable indicates the app is not ready for traffic.
    res.status(503).send('Service Unavailable');
  }
});

// --- Original Application Routes ---

/**
 * @module writingWorkflowRoutes
 * @description Defines API routes for the writing assistant workflow.
 */
const router = express.Router();

/**
 * @swagger
 * /assistant:
 *   post:
 *     summary: Initiate a writing assistant request.
 *     description: |
 *       Handles requests to the AI writing assistant. This endpoint applies several middlewares:
 *       - `optionalAuth()`: Authenticates the user if a token is provided, making user-specific features available.
 *       - `extractTenantContext`: Extracts tenant information from the request, essential for multi-tenancy.
 *       - `checkDailyRequestLimit`: Verifies if the user or tenant has exceeded their daily request quota.
 *       The request is then processed by the `writingController` to generate AI-powered writing content.
 *     tags:
 *       - Writing
 *       - Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Input for the writing assistant. The specific schema is defined by the writingController.
 *             example:
 *               prompt: "Write a short story about a cat who learns to fly."
 *               options:
 *                 tone: "whimsical"
 *                 length: "short"
 *     responses:
 *       200:
 *         description: Successfully generated content from the writing assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: string
 *                   description: The generated text content.
 *                   example: "Once upon a time, there was a cat named Whiskers..."
 *       400:
 *         description: Bad request, e.g., missing or invalid prompt.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized if authentication is required for certain features and not provided.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden, e.g., daily request limit exceeded.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - bearerAuth: [] # Indicates that a bearer token can optionally be used for authentication.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  writingController
);

// Mount the application routes
app.use(router);

// --- Server Startup & Graceful Shutdown ---

// Cloud Run provides the PORT environment variable. Default to 8080 for local development.
const PORT = process.env.PORT || 8080;

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // TODO: Place asynchronous startup logic here, like connecting to a database.
  // Once all startup tasks are complete, mark the service as ready.
  // For example:
  // db.connect().then(() => {
  //   console.log('Database connected successfully.');
  //   isReady = true;
  //   console.log('Server is now ready to accept traffic.');
  // }).catch(err => {
  //   console.error('Failed to connect to the database:', err);
  //   process.exit(1); // Exit if critical connections fail
  // });

  // For this example, we'll assume readiness immediately after server starts.
  // In a real application, this should be tied to actual events like a DB connection.
  isReady = true;
  console.log('Server is now ready to accept traffic.');
});

// Graceful shutdown logic
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  // 1. Stop accepting new traffic by failing readiness probes.
  isReady = false;
  console.log('Readiness probe will now fail. No new traffic will be sent.');

  // 2. Stop the server from accepting new connections and wait for existing ones to finish.
  // Cloud Run gives a 10-second grace period by default before sending SIGKILL.
  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }

    console.log('HTTP server closed. All requests have been handled.');

    // 3. Close other connections (e.g., database, message queues).
    // For example:
    // db.close().then(() => {
    //   console.log('Database connection closed.');
    //   process.exit(0);
    // }).catch(dbErr => {
    //   console.error('Error closing database connection:', dbErr);
    //   process.exit(1);
    // });

    // In this example, we just exit.
    console.log('Shutdown complete.');
    process.exit(0);
  });

  // Force shutdown if the graceful shutdown process takes too long.
  setTimeout(() => {
    console.error('Could not close connections in time, forcing shutdown.');
    process.exit(1);
  }, 9500); // Set slightly less than the default 10s Cloud Run timeout
};

// Listen for termination signals from the host environment
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Sent by Cloud Run, Docker, Kubernetes
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // For local development (Ctrl+C)