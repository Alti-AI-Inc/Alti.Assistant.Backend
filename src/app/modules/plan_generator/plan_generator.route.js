/**
 * @file Defines the routes for the Plan Generator module.
 * @module routes/planGenerator
 * @requires express
 * @requires http
 * @requires @google-cloud/storage
 * @requires busboy
 * @requires uuid
 * @requires path
 * @requires ../../middlewares/auth/auth
 * @requires ../../middlewares/auth/optionalAuth
 * @requires ../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit
 * @requires ../../middlewares/rateLimit/authLimiter
 * @requires ../../middlewares/validateRequest/validateRequest
 * @requires ../../middlewares/tenant/tenantContext
 * @requires ./plan_generator.controller
 * @requires ./plan_generator.validation
 * @requires ../../middlewares/checkRAGFeature/checkRAGFeature
 * @requires ../../middlewares/checkStorageLimit/checkStorageLimit
 *
 * @description This file sets up the Express router for all plan generation and assistant-related endpoints.
 * It includes routes for conversational AI, direct plan generation, brainstorming, exporting plans, and retrieving conversation history.
 * All file uploads and exports are handled by streaming directly to/from Google Cloud Storage (GCS)
 * to ensure the application remains stateless and scalable, suitable for environments like Google Cloud Run.
 *
 * Middleware stack includes:
 * - `optionalAuth` / `auth`: For handling authenticated and guest users.
 * - `extractTenantContext`: For multi-tenancy support, isolating data and usage by tenant.
 * - `checkDailyRequestLimit`: To enforce usage quotas.
 * - `checkStorageLimit`: To enforce storage quotas for file uploads.
 * - `gcsUpload`: Custom middleware for streaming multipart/form-data file uploads directly to GCS.
 * - `checkRAGFeature`: To gate access to the RAG feature based on tenant/user subscription.
 * - `validateRequest`: For validating request bodies and parameters against Zod schemas.
 */
import express from 'express';
import http from 'http';
import { Storage } from '@google-cloud/storage';
import Busboy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { planGeneratorController } from './plan_generator.controller.js';
import { PlanGeneratorValidation } from './plan_generator.validation.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// --- Google Cloud Storage Setup ---
// This assumes that the GCS client is authenticated, e.g., via
// Application Default Credentials when running on Google Cloud.
const storage = new Storage();
// Bucket names should be configured via environment variables.
const uploadsBucketName = process.env.GCS_UPLOADS_BUCKET;

if (!uploadsBucketName) {
  // In a real app, you might have a more robust configuration check.
  // For this context, we'll log an error, and file operations will fail.
  console.error('GCS_UPLOADS_BUCKET environment variable is not set. File upload operations will fail.');
}

/**
 * Middleware to handle multipart/form-data and stream file uploads directly to GCS.
 * This replaces multer and its local disk storage, ensuring statelessness.
 * It parses non-file fields and populates `req.body`.
 * The uploaded file info is attached to `req.file`.
 * @returns {Function} Express middleware.
 */
const gcsUpload = () => (req, res, next) => {
  // The 'validateRequest' middleware expects a parsed body. Since we are handling
  // multipart/form-data, we need to parse the fields and populate req.body here.
  // We also handle the file stream.
  if (!req.headers['content-type']?.startsWith('multipart/form-data')) {
    // If not a multipart request, just move on. This allows the same route
    // to handle application/json if no file is sent.
    return next();
  }

  const busboy = Busboy({ headers: req.headers });
  const fields = {};
  const filePromises = [];

  busboy.on('field', (fieldname, val) => {
    // For fields like 'message', 'conversationId', etc., we parse them into an object.
    // This handles nested objects sent as form fields, e.g., context[key]=value
    const fieldParts = fieldname.split('[').map(part => part.replace(']', ''));
    let current = fields;
    for (let i = 0; i < fieldParts.length - 1; i++) {
      const part = fieldParts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    current[fieldParts[fieldParts.length - 1]] = val;
  });

  busboy.on('file', (fieldname, file, { filename, encoding, mimeType }) => {
    if (!filename) {
      // No file was uploaded, just drain the stream.
      return file.resume();
    }
    if (!uploadsBucketName) {
      return next(new Error('GCS_UPLOADS_BUCKET is not configured.'));
    }

    // Generate a unique filename to prevent overwrites in the bucket.
    const gcsFileName = `${uuidv4()}-${path.basename(filename)}`;
    const gcsFile = storage.bucket(uploadsBucketName).file(gcsFileName);
    const writeStream = gcsFile.createWriteStream({
      metadata: {
        contentType: mimeType,
      },
    });

    file.pipe(writeStream);

    const filePromise = new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        // The file has been fully uploaded to GCS.
        req.file = {
          fieldname,
          originalname: filename,
          encoding,
          mimetype: mimeType,
          bucket: uploadsBucketName,
          name: gcsFileName,
          gcsUrl: `gs://${uploadsBucketName}/${gcsFileName}`,
        };
        resolve();
      });

      writeStream.on('error', err => {
        // An error occurred during the GCS upload.
        reject(err);
      });
    });

    filePromises.push(filePromise);
  });

  busboy.on('finish', async () => {
    try {
      // Wait for all file uploads to complete.
      await Promise.all(filePromises);
      // Merge parsed fields into req.body. If the original request was JSON,
      // express.json() would have already populated req.body. If it was multipart,
      // req.body is empty, so we populate it.
      req.body = { ...req.body, ...fields };
      next();
    } catch (err) {
      next(err);
    }
  });

  // Pipe the request stream into busboy to start parsing.
  req.pipe(busboy);
};

// --- Cloud Run & Graceful Shutdown Setup ---

/**
 * The main Express application instance.
 * This instance is used to set up global middleware and health check endpoints
 * before mounting the main application router.
 * @type {import('express').Application}
 */
const app = express();
// It's a good practice to use Express's JSON middleware for parsing request bodies.
app.use(express.json());

/**
 * A flag to indicate if the server is in the process of shutting down.
 * This is used by the `/readyz` readiness probe to signal to the orchestrator
 * (e.g., Cloud Run) that it should not send any new traffic to this instance.
 * @type {boolean}
 */
let isShuttingDown = false;

/**
 * @name GET /healthz
 * @summary Liveness probe endpoint.
 * @description Responds with a 200 OK status to indicate that the server process is alive and running.
 * This is used by container orchestrators like Kubernetes or Cloud Run to determine if the container
 * needs to be restarted.
 * @function
 * @memberof module:routes/planGenerator
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

/**
 * @name GET /readyz
 * @summary Readiness probe endpoint.
 * @description Responds with a 200 OK status if the server is ready to accept new requests.
 * If the server is shutting down (`isShuttingDown` is true), it responds with a 503 Service Unavailable status.
 * This tells the load balancer to stop sending traffic to this instance.
 * In a production environment, this check should be extended to verify connections to critical dependencies (e.g., database, cache).
 * @function
 * @memberof module:routes/planGenerator
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
app.get('/readyz', (req, res) => {
  if (isShuttingDown) {
    // If the server is shutting down, it's no longer "ready" for new requests.
    res.status(503).send('Service Unavailable: Shutting down');
  } else {
    // TODO: Add checks for critical dependencies like database connections.
    // For example: if (!isDatabaseConnected()) return res.status(503).send('Database not ready');
    res.status(200).send('OK');
  }
});

// --- Original Route Definitions ---

/**
 * A higher-order function to wrap async route handlers and catch any thrown errors.
 * This avoids the need for `try...catch` blocks in every async controller function
 * and ensures that errors are passed to the Express error handling middleware.
 * @param {Function} fn - The asynchronous controller function to wrap.
 * @returns {Function} An Express middleware function that executes the controller and catches errors.
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Express router for the Plan Generator module.
 * All routes defined in this file are prefixed with `/api/v1/plan-generator`.
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/plan-generator/assistant:
 *   post:
 *     summary: Conversational AI Assistant
 *     description: >
 *       Main entry point for the conversational AI assistant. Supports natural language requests and optional file uploads for Retrieval Augmented Generation (RAG).
 *       File uploads are streamed directly to a secure Google Cloud Storage bucket and never touch the local filesystem.
 *       Handles both authenticated and guest users, with different rate limits and feature access applied accordingly.
 *       Tenant context is extracted for authenticated users to ensure data isolation and proper billing/quota management.
 *     tags:
 *       - Assistant
 *       - Plan Generation
 *     consumes:
 *       - multipart/form-data
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: Optional file for RAG context, such as a document or image.
 *       - in: body
 *         name: body
 *         description: Conversational request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ConversationalRequest'
 *     responses:
 *       200:
 *         description: Successful response with assistant's reply and generated plan data.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 plan:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions or daily limit exceeded.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  gcsUpload(), // Replaced local file upload with direct-to-GCS streaming.
  checkRAGFeature,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  asyncHandler(planGeneratorController.conversationalAssistant) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/assistant/async:
 *   post:
 *     summary: Asynchronous Conversational AI Assistant
 *     description: >
 *       Initiates an asynchronous conversational AI task. Returns a task ID immediately.
 *       The status and result can be retrieved via `/api/v1/plan-generator/task/{taskId}`.
 *       Supports optional file uploads for RAG, which are streamed directly to GCS. This endpoint is suitable for long-running generation tasks.
 *       Tenant context and usage limits are applied.
 *     tags:
 *       - Assistant
 *       - Plan Generation
 *       - Asynchronous
 *     consumes:
 *       - multipart/form-data
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: Optional file for RAG context, such as a document or image.
 *       - in: body
 *         name: body
 *         description: Conversational request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ConversationalRequest'
 *     responses:
 *       202:
 *         description: Accepted - Task initiated successfully. Returns a task ID.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                   description: The ID of the asynchronous task.
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions or daily limit exceeded.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/assistant/async',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  gcsUpload(), // Replaced local file upload with direct-to-GCS streaming.
  // createRateLimiter(30, 15),
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  asyncHandler(planGeneratorController.conversationalAssistantAsync) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/task/{taskId}:
 *   get:
 *     summary: Get Asynchronous Task Status and Result
 *     description: >
 *       Retrieves the current status and, if completed, the result of an asynchronous plan generation task.
 *       Access may be restricted based on task ownership for authenticated users.
 *     tags:
 *       - Asynchronous
 *       - Plan Generation
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: taskId
 *         description: The ID of the asynchronous task.
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Successful response with task status and result (if completed).
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [pending, in_progress, completed, failed]
 *                 result:
 *                   type: object
 *                   description: The result of the task, present if status is 'completed'.
 *       400:
 *         description: Bad Request - Invalid task ID format.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have permission to access this task.
 *       404:
 *         description: Not Found - Task with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.get(
  '/task/:taskId',
  optionalAuth(),
  asyncHandler(planGeneratorController.getTaskStatus) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/generate:
 *   post:
 *     summary: Direct Plan Generation
 *     description: >
 *       Generates a plan directly based on provided parameters, bypassing the conversational interface.
 *       Ideal for programmatic integration. Tenant context and usage limits are applied.
 *     tags:
 *       - Plan Generation
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Plan generation parameters.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/GeneratePlanRequest'
 *     responses:
 *       200:
 *         description: Successful response with the generated plan data.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 plan:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions or daily limit exceeded.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  // createRateLimiter(20, 15), // 20 generations per 15 minutes
  validateRequest(PlanGeneratorValidation.generatePlanSchema),
  asyncHandler(planGeneratorController.generatePlan) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/brainstorm:
 *   post:
 *     summary: Brainstorm Ideas
 *     description: >
 *       Generates brainstorming insights or ideas based on a prompt, without creating a full plan.
 *       Tenant context and usage limits are applied.
 *     tags:
 *       - Plan Generation
 *       - Brainstorming
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Brainstorming request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/BrainstormRequest'
 *     responses:
 *       200:
 *         description: Successful response with brainstorming insights.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 ideas:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/brainstorm',
  optionalAuth(),
  extractTenantContext, // Added: Ensure tenant context is extracted for resource management, consistent with other generation routes.
  checkDailyRequestLimit, // Added: Ensure daily request limits are applied for resource-consuming operations, consistent with other generation routes.
  // createRateLimiter(30, 15), // 30 brainstorms per 15 minutes
  validateRequest(PlanGeneratorValidation.brainstormSchema),
  asyncHandler(planGeneratorController.brainstormIdea) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/export:
 *   post:
 *     summary: Export Plan to Cloud Storage
 *     description: >
 *       Exports a previously generated plan into various formats (PDF, DOCX, etc.).
 *       The file is generated and streamed directly to a secure Google Cloud Storage bucket.
 *       The API responds with a short-lived signed URL for the client to download the file.
 *       This approach is stateless, secure, and handles large files efficiently.
 *     tags:
 *       - Plan Generation
 *       - Export
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Export plan request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ExportPlanRequest'
 *     responses:
 *       200:
 *         description: Successful response with a signed URL to download the exported file.
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
 *                   example: "Export successful. Use the URL to download your file."
 *                 data:
 *                   type: object
 *                   properties:
 *                     downloadUrl:
 *                       type: string
 *                       format: uri
 *                       description: A short-lived signed URL to download the generated export file.
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/export',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  // createRateLimiter(20, 15), // 20 exports per 15 minutes
  validateRequest(PlanGeneratorValidation.exportPlanSchema),
  // The controller is now expected to generate the file, stream it to GCS,
  // and return a JSON response with a short-lived signed URL for download.
  // This avoids writing to the local filesystem and sending large binary payloads.
  asyncHandler(planGeneratorController.exportPlanAndGetSignedUrl)
);

/**
 * @swagger
 * /api/v1/plan-generator/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: >
 *       Retrieves the full conversation history and associated plan data for a specific conversation ID.
 *
 *       **Permissions:** Requires `USER` or `ADMIN` role. A `USER` can only access their own conversations.
 *     tags:
 *       - Assistant
 *       - History
 *     security:
 *       - bearerAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         description: The ID of the conversation to retrieve.
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Successful response with the conversation history and plan data.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 conversation:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                       content:
 *                         type: string
 *                 plan:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid conversation ID format.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have permission to access this conversation.
 *       404:
 *         description: Not Found - Conversation with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(PlanGeneratorValidation.getConversationHistorySchema),
  asyncHandler(planGeneratorController.getConversationHistory) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * components:
 *   schemas:
 *     ConversationalRequest:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: The user's message or prompt.
 *         conversationId:
 *           type: string
 *           description: Optional ID of an existing conversation to continue.
 *         context:
 *           type: object
 *           description: Optional additional context for the AI.
 *         planId:
 *           type: string
 *           description: Optional ID of an existing plan to modify or reference.
 *       required:
 *         - message
 *     GeneratePlanRequest:
 *       type: object
 *       properties:
 *         prompt:
 *           type: string
 *           description: The main prompt for generating the plan.
 *         parameters:
 *           type: object
 *           description: Optional specific parameters for plan generation (e.g., target audience, length).
 *         planId:
 *           type: string
 *           description: Optional ID of an existing plan to modify or reference.
 *       required:
 *         - prompt
 *     BrainstormRequest:
 *       type: object
 *       properties:
 *         prompt:
 *           type: string
 *           description: The prompt for brainstorming ideas.
 *         context:
 *           type: object
 *           description: Optional additional context for brainstorming.
 *       required:
 *         - prompt
 *     ExportPlanRequest:
 *       type: object
 *       properties:
 *         planId:
 *           type: string
 *           description: The ID of the plan to export.
 *         format:
 *           type: string
 *           description: The desired export format (e.g., "pdf", "docx", "json", "md").
 *         options:
 *           type: object
 *           description: Optional export-specific options (e.g., template, styling).
 *       required:
 *         - planId
 *         - format
 */

// Mount the router on the main Express app.
app.use('/api/v1/plan-generator', router);

// --- Server Startup and Graceful Shutdown ---

/**
 * The port number on which the server will listen.
 * It uses the `PORT` environment variable provided by Cloud Run or other hosting environments,
 * falling back to 8080 for local development.
 * @type {number}
 */
const PORT = process.env.PORT || 8080;

/**
 * The underlying Node.js HTTP server instance.
 * @type {http.Server}
 */
const server = http.createServer(app);

/**
 * Handles graceful shutdown of the server.
 * This function is triggered by `SIGTERM` (from Cloud Run) or `SIGINT` (Ctrl+C).
 * It stops the server from accepting new connections, allows existing requests to finish,
 * closes database connections, and then exits the process.
 * @param {string} signal - The signal that triggered the shutdown (e.g., 'SIGTERM').
 */
const gracefulShutdown = signal => {
  console.log(`[${signal}] received. Shutting down gracefully...`);
  isShuttingDown = true; // Mark as shutting down for readiness probe

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed. No new connections will be accepted.');

    // TODO: Close database connections, Redis clients, etc.
    // This is a critical step to prevent data corruption.
    // Example for Prisma: await prisma.$disconnect();
    // Example for Mongoose: await mongoose.connection.close();
    console.log('Closing database connections...');
    // await closeDatabaseConnections(); // Replace with your actual DB closing logic

    console.log('Shutdown complete.');
    process.exit(0);
  });

  // If the server hasn't closed after a timeout, force exit.
  // Cloud Run allows a 10-second grace period by default.
  setTimeout(() => {
    console.error('Could not close connections in time, forcing shutdown.');
    process.exit(1);
  }, 9500); // 9.5 seconds, slightly less than the default 10s
};

// Listen for termination signals
// SIGTERM is sent by Cloud Run to signal shutdown.
// SIGINT is sent when you press Ctrl+C locally.
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // In a real application, you might set a 'ready' flag here after DB connections are confirmed.
});