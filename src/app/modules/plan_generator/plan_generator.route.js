import express from 'express';
import http from 'http';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { planGeneratorController } from './plan_generator.controller.js';
import { PlanGeneratorValidation } from './plan_generator.validation.js';
import { uploadPlanFiles } from './middlewares/uploadPlanFiles.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// --- Cloud Run & Graceful Shutdown Setup ---

const app = express();
// It's a good practice to use Express's JSON middleware for parsing request bodies.
app.use(express.json());

// A flag to indicate the server is shutting down. Used by the readiness probe.
let isShuttingDown = false;

// Liveness probe endpoint: Indicates if the server process is running.
// Cloud Run uses this to check if the container needs to be restarted.
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Readiness probe endpoint: Indicates if the server is ready to accept traffic.
// Cloud Run stops sending new requests to instances that fail this check.
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

// Helper function to wrap async controller functions and catch errors.
// This prevents unhandled promise rejections from crashing the server
// and ensures errors are passed to the Express error handling middleware.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const router = express.Router();

/**
 * @swagger
 * /api/v1/plan-generator/assistant:
 *   post:
 *     summary: Conversational AI Assistant
 *     description: Main entry point for the conversational AI assistant. Supports natural language requests and optional file uploads for Retrieval Augmented Generation (RAG). Handles both authenticated and guest users.
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
  uploadPlanFiles.single('file'),
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
 *     description: Initiates an asynchronous conversational AI task. Returns a task ID immediately. The status and result can be retrieved via `/api/v1/plan-generator/task/{taskId}`. Supports optional file uploads for RAG.
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
  checkStorageLimit, // Added: Ensure storage limit is checked for file uploads in async requests, consistent with synchronous assistant.
  uploadPlanFiles.single('file'),
  // createRateLimiter(30, 15),
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  asyncHandler(planGeneratorController.conversationalAssistantAsync) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/task/{taskId}:
 *   get:
 *     summary: Get Asynchronous Task Status and Result
 *     description: Retrieves the current status and, if completed, the result of an asynchronous plan generation task.
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
 *     description: Generates a plan directly based on provided parameters, bypassing the conversational interface. Ideal for programmatic integration.
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
 *     description: Generates brainstorming insights or ideas based on a prompt, without creating a full plan.
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
 *     summary: Export Plan
 *     description: Exports a previously generated plan into various formats such as PDF, DOCX, JSON, or Markdown.
 *     tags:
 *       - Plan Generation
 *       - Export
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/pdf
 *       - application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *       - application/json
 *       - text/markdown
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Export plan request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ExportPlanRequest'
 *     responses:
 *       200:
 *         description: Successful response with the exported plan data/file.
 *         schema:
 *           type: string
 *           format: binary
 *         headers:
 *           Content-Disposition:
 *             type: string
 *             description: Attachment filename.
 *           Content-Type:
 *             type: string
 *             description: The content type of the exported file (e.g., application/pdf).
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
  extractTenantContext, // Added: Ensure tenant context is extracted for resource management, consistent with other generation routes.
  checkDailyRequestLimit, // Added: Ensure daily request limits are applied for resource-consuming operations, consistent with other generation routes.
  // createRateLimiter(20, 15), // 20 exports per 15 minutes
  validateRequest(PlanGeneratorValidation.exportPlanSchema),
  asyncHandler(planGeneratorController.exportPlan) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: Retrieves the full conversation history and associated plan data for a specific conversation ID. Requires user or admin authentication.
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
 * @typedef {object} ConversationalRequest
 * @property {string} message - The user's message or prompt.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {object} [context] - Optional additional context for the AI.
 * @property {string} [planId] - Optional ID of an existing plan to modify or reference.
 */

/**
 * @typedef {object} GeneratePlanRequest
 * @property {string} prompt - The main prompt for generating the plan.
 * @property {object} [parameters] - Optional specific parameters for plan generation (e.g., target audience, length).
 * @property {string} [planId] - Optional ID of an existing plan to modify or reference.
 */

/**
 * @typedef {object} BrainstormRequest
 * @property {string} prompt - The prompt for brainstorming ideas.
 * @property {object} [context] - Optional additional context for brainstorming.
 */

/**
 * @typedef {object} ExportPlanRequest
 * @property {string} planId - The ID of the plan to export.
 * @property {string} format - The desired export format (e.g., "pdf", "docx", "json", "md").
 * @property {object} [options] - Optional export-specific options (e.g., template, styling).
 */

// Mount the router on the main Express app.
app.use('/api/v1/plan-generator', router);

// --- Server Startup and Graceful Shutdown ---

// Cloud Run provides the PORT environment variable. Fallback to 8080 for local development.
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// Graceful shutdown logic
const gracefulShutdown = (signal) => {
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