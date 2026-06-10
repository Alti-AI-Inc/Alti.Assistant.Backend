import httpStatus from 'http-status';
import express from 'express';
import mongoose from 'mongoose';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentAnalysisService } from './document_analysis.service.js';
import SubscriptionModel from '../payment/payment.model.js';
// Optimization: For better query performance on SubscriptionModel, consider adding indexes.
// For queries like `SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 })`,
// recommended indexes are:
// 1. { userId: 1 }
// 2. { userId: 1, createdAt: -1 } (a compound index for the find and sort combination)
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // This import is no longer needed after logic correction.
import { RESPONSE_MESSAGES } from './document_analysis.constant.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Enterprise Rate-Limiting Configurations to prevent DDoS, API abuse, and LLM cost runaway.
// Using RateLimiterMemory as a highly reliable, zero-dependency in-memory fallback.
// For multi-server/distributed production environments, swap with RateLimiterRedis.
const analysisGuestLimiter = new RateLimiterMemory({
  points: 10, // 10 analysis requests
  duration: 3600, // per hour (60 minutes)
  blockDuration: 600, // Block for 10 minutes if exceeded
});

const analysisAuthLimiter = new RateLimiterMemory({
  points: 100, // 100 analysis requests
  duration: 3600, // per hour (60 minutes)
  blockDuration: 300, // Block for 5 minutes if exceeded
});

const historyLimiter = new RateLimiterMemory({
  points: 300, // 300 history retrieval requests
  duration: 900, // per 15 minutes
});

/**
 * @typedef {object} FileInfo
 * @property {string} filename - The name of the file on the server.
 * @property {string} originalname - The original name of the uploaded file.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} path - The temporary path where the file is stored.
 * @property {string} location - The final storage location (e.g., S3 URL or local path).
 */

/**
 * @typedef {object} AnalyzeDocumentRequestBody
 * @property {string} [message] - The text content to analyze. Required if no file is uploaded.
 * @property {string} [conversationId] - The ID of an existing conversation to continue.
 * @property {string} [analysisType] - The type of analysis to perform (e.g., 'summary', 'qa').
 * @property {string} [outputFormat] - The desired format for the analysis output (e.g., 'markdown', 'json').
 */

/**
 * @typedef {object} AnalyzeDocumentResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} messageId - The ID of the generated message.
 * @property {string} response - The analysis result.
 * @property {string} [fileUrl] - URL of the processed file, if applicable.
 */

/**
 * @typedef {object} ConversationHistoryResponseData
 * @property {string} _id - The ID of the conversation entry.
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} userId - The ID of the user.
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} [fileUrl] - URL of the file associated with the message, if any.
 * @property {Date} createdAt - The timestamp when the message was created.
 * @property {Date} updatedAt - The timestamp when the message was last updated.
 */

/**
 * Analyze document or text endpoint
 * Handles both file upload and text analysis with optional conversation context.
 *
 * @summary Analyze document or text content.
 * @description This endpoint processes either an uploaded document file or a text message for analysis.
 * It supports optional conversation context and different analysis types and output formats.
 * It also enforces subscription limits for authenticated users.
 *
 * @security Guest Access / Authenticated User
 * @permission Multi-tenant / User-isolated. Authenticated users are restricted by their subscription limits. Guests have auto-generated temporary IDs.
 *
 * @param {import('express').Request & { file?: FileInfo, isGuest?: boolean, user?: { userId: string, _id: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-analysis/analyze:
 *   post:
 *     summary: Analyze document or text content
 *     description: Processes either an uploaded document file or a text message for analysis. Enforces subscription limits for authenticated users.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The text content to analyze. Required if no file is uploaded.
 *               conversationId:
 *                 type: string
 *                 description: The ID of an existing conversation to continue.
 *               analysisType:
 *                 type: string
 *                 description: The type of analysis to perform (e.g., 'summary', 'qa').
 *               outputFormat:
 *                 type: string
 *                 description: The desired format for the analysis output (e.g., 'markdown', 'json').
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The document file to upload for analysis. Required if no message is provided.
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *               conversationId:
 *                 type: string
 *               analysisType:
 *                 type: string
 *               outputFormat:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document analysis successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document analysis successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     messageId:
 *                       type: string
 *                     response:
 *                       type: string
 *                     fileUrl:
 *                       type: string
 *       400:
 *         description: Bad Request - Neither file nor message provided
 *       403:
 *         description: Forbidden - Usage limit exceeded or no active subscription
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const analyzeDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  // --- Security Enhancement: User ID Management ---
  // User ID must be immutably sourced from the authentication token (for logged-in users)
  // or generated server-side (for guests). Allowing it to be overridden from the request
  // body is a critical security vulnerability that could lead to data tampering and
  // unauthorized access to other users' conversations.
  const userId = isGuest
    ? documentAnalysisService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, analysisType, outputFormat } = req.body;

  // --- Rate Limiting ---
  // Apply rate limiting early to prevent resource abuse before any heavy processing.
  const rateLimitKey = isGuest ? req.ip : userId;
  const limiter = isGuest ? analysisGuestLimiter : analysisAuthLimiter;

  try {
    await limiter.consume(rateLimitKey);
  } catch (rateLimiterRes) {
    logger.warn(`Rate limit exceeded for ${isGuest ? 'guest' : 'user'} ${rateLimitKey} on analyzeDocument`);
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please slow down and try again later.',
    });
  }

  // --- File Handling & Input Validation ---
  const fileInfo = req.file
    ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        location: req.file.location || req.file.path,
      }
    : null;

  // A user must provide content to be analyzed, either as text or a file.
  if (!fileInfo && (!message || message.trim() === '')) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Request must include a file or a non-empty message for analysis.',
    });
  }

  logger.info(
    `Analysis request from ${isGuest ? 'guest' : 'user'} ${userId}`,
    { hasFile: !!fileInfo, hasMessage: !!message, conversationId, analysisType }
  );

  // --- Subscription & Usage Limit Enforcement for Authenticated Users ---
  if (!isGuest) {
    // Find the user's most recent (and presumably active) subscription plan.
    const subscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean();

    // --- Logic Correction: Usage Limit Check ---
    // The previous logic was flawed. This corrected logic properly checks if the user's
    // current usage has met or exceeded their plan's limit.
    // This assumes the SubscriptionModel contains `currentUsage` and `usageLimit` fields.
    if (!subscription || (subscription.currentUsage >= subscription.usageLimit)) {
      logger.warn(`Usage limit exceeded for user ${userId}. Current: ${subscription?.currentUsage}, Limit: ${subscription?.usageLimit}`);
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Usage limit exceeded or no active subscription. Please upgrade your plan.',
      });
    }
  }

  // --- Service Layer Call ---
  // The service layer is responsible for the core business logic:
  // 1. Processing the file/text.
  // 2. Interacting with the LLM.
  // 3. Saving conversation messages.
  // 4. **Atomically** incrementing the user's usage count within a database transaction
  //    to ensure data consistency (i.e., a prompt is saved if and only if usage is incremented).
  const result = await documentAnalysisService.analyzeContent(
    userId,
    message,
    fileInfo,
    conversationId,
    analysisType,
    outputFormat,
    isGuest,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: RESPONSE_MESSAGES.SUCCESS,
    data: result,
  });
});

/**
 * Get conversation history endpoint
 *
 * @summary Retrieve the history of a specific conversation.
 * @description Fetches all messages and analysis results associated with a given conversation ID for the authenticated user.
 *
 * @security Authenticated User
 * @permission Multi-tenant / User-isolated. Users can only access conversations belonging to their own `userId`.
 *
 * @param {import('express').Request & { user?: { userId: string, _id: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-analysis/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve the history of a specific conversation
 *     description: Fetches all messages and analysis results associated with a given conversation ID for the authenticated user.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the conversation.
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ConversationHistoryResponseData'
 *       400:
 *         description: Bad Request - Invalid conversation ID format
 *       404:
 *         description: Conversation not found or not accessible
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  // --- Input Validation ---
  // Validate that the conversationId is a valid MongoDB ObjectId before querying the database.
  // This prevents malformed queries, potential errors, and provides a clearer error to the client.
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Invalid conversation ID format.',
    });
  }

  // --- Rate Limiting ---
  try {
    await historyLimiter.consume(userId || req.ip);
  } catch (rateLimiterRes) {
    logger.warn(`Rate limit exceeded for user ${userId || req.ip} on getConversationHistory`);
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  }

  logger.info(
    `Fetching conversation history: ${conversationId} for user ${userId}`
  );

  // The service layer must ensure that the conversation belongs to the requesting userId
  // to maintain data isolation and privacy.
  const conversation = await documentAnalysisService.getConversationHistory(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation history retrieved successfully',
    data: conversation,
  });
});

/**
 * @namespace documentAnalysisController
 * @description Controller for handling document analysis and conversation-related operations.
 * This object groups all the route handlers for document analysis features.
 */
export const documentAnalysisController = {
  analyzeDocument,
  getConversationHistory,
};

// --- Cloud Run Lifecycle & Server Implementation ---
// NOTE: Typically, server startup, health checks, and graceful shutdown logic
// reside in a dedicated entrypoint file (e.g., server.js or index.js),
// not within a controller file. This has been added here to fulfill the request
// of making the application Cloud Run ready based on the provided file.

const app = express();
let isShuttingDown = false;

// --- Health & Readiness Probes ---

// Liveness probe: Checks if the server process is running.
// Cloud Run uses this to determine if the container needs to be restarted.
app.get('/healthz', (req, res) => {
  // This endpoint should not check dependencies. If the server is up, it's live.
  res.status(200).send('OK');
});

// Readiness probe: Checks if the server is ready to accept traffic.
// Cloud Run uses this to route traffic to new instances.
// It should fail if dependencies (like the database) are down or during shutdown.
app.get('/readyz', (req, res) => {
  const isDbReady = mongoose.connection.readyState === 1; // 1 means connected
  if (isDbReady && !isShuttingDown) {
    res.status(200).send('OK');
  } else {
    // Return 503 Service Unavailable if database is not ready or server is shutting down.
    const reason = isShuttingDown ? 'Server is shutting down' : 'Database not connected';
    logger.warn(`Readiness probe failed: ${reason}`);
    res.status(503).send(reason);
  }
});

// --- Application Routes ---
// This section sets up the API routes defined in this controller.
// In a larger application, this would be handled by a main router.
app.use(express.json()); // Middleware to parse JSON bodies

// NOTE: Assuming a file upload middleware like 'multer' is configured elsewhere
// for the '/api/v1/document-analysis/analyze' route.
const apiRouter = express.Router();
apiRouter.post('/document-analysis/analyze', analyzeDocument);
apiRouter.get('/document-analysis/conversations/:conversationId', getConversationHistory);
app.use('/api/v1', apiRouter);


// --- Server Startup ---
// Cloud Run requires the server to listen on the port defined by the PORT env var.
const PORT = process.env.PORT || 8080;

// Connect to MongoDB - replace with your actual connection string from environment variables
// In a real app, this would be in a separate database configuration file.
mongoose.connect(process.env.DATABASE_URL || 'mongodb://localhost:27017/mydatabase')
  .then(() => {
    logger.info('✅ Database connection successful.');
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server listening on port ${PORT}`);
    });

    // --- Graceful Shutdown Logic ---
    const gracefulShutdown = (signal) => {
      logger.warn(`Received ${signal}, starting graceful shutdown...`);
      isShuttingDown = true; // Mark server as shutting down for readiness probe

      // 1. Stop accepting new connections. The `server.close` method stops the server
      // from accepting new connections and waits for existing ones to complete.
      server.close((err) => {
        if (err) {
          logger.error('Error during server shutdown:', err);
          process.exit(1);
        }

        logger.info('✅ HTTP server closed. No new connections will be accepted.');

        // 2. Close database connections
        mongoose.connection.close(false, () => {
          logger.info('✅ MongoDB connection closed.');
          // 3. Exit the process
          process.exit(0);
        });
      });

      // Force shutdown after a timeout if connections don't close
      setTimeout(() => {
        logger.error('Could not close connections in time, forcing shutdown.');
        process.exit(1);
      }, 10000); // 10 seconds timeout, as recommended by Google Cloud Run
    };

    // Listen for termination signals from Cloud Run (SIGTERM)
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    // Also listen for SIGINT for local development (Ctrl+C)
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  })
  .catch(err => {
    logger.error('❌ Database connection failed. Server not started.', err);
    process.exit(1);
  });