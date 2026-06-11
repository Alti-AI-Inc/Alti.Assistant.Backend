import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { planGeneratorService } from './plan_generator.service.js';
import SubscriptionModel from '../subscription/subscription.model.js'; // SubscriptionModel is imported but not used in this file.
import { conversationHelpers } from '../conversations/conversation.helpers.js'; // conversationHelpers is imported but not used in this file.
import { taskManager } from './plan_generator.taskmanager.js';
// Enterprise Rate-Limiting & DDOS Guard Agent AI: Import rate limiter utility.
// This assumes a utility exists that creates Express middleware for rate limiting.
import createLimiter from '../../../middlewares/rateLimiter.js';

// --- Enterprise Rate-Limiting & DDOS Guard Agent AI: Definitions ---

/**
 * Default key generator for rate limiters.
 * Uses the authenticated user's ID for logged-in users to track usage per account.
 * Falls back to the request's IP address for guest (unauthenticated) users.
 * @param {import('express').Request} req - The Express request object.
 * @returns {string} The user ID or IP address to use as the rate limit key.
 */
const keyGenerator = (req) => req.user?.userId || req.user?._id || req.ip;

// --- AI Generation Limiters (for expensive, resource-intensive endpoints) ---

/**
 * Stricter rate limiter for GUEST users (IP-based) on expensive AI endpoints.
 * This prevents anonymous abuse and encourages user registration.
 * Limit: 10 requests per hour per IP.
 * @type {import('express').RequestHandler}
 */
const aiGenerationLimiterGuest = createLimiter({
  points: 10,
  duration: 60 * 60, // 1 hour
  keyGenerator: (req) => req.ip, // Explicitly key by IP for guests
  errorMessage:
    'Too many plan generation requests. Please create an account or try again later.',
});

/**
 * Generous rate limiter for AUTHENTICATED users (User ID-based) on expensive AI endpoints.
 * In a production system, these points could be tied to subscription tiers.
 * Limit: 200 requests per day per user.
 * @type {import('express').RequestHandler}
 */
const aiGenerationLimiterUser = createLimiter({
  points: 200,
  duration: 24 * 60 * 60, // 1 day
  keyGenerator: (req) => req.user?.userId || req.user?._id, // Explicitly key by user ID
  errorMessage: 'You have reached your daily limit for plan generation.',
});

/**
 * Burst protection for all users on AI endpoints to prevent rapid-fire requests
 * that can spike server load or API costs.
 * Limit: 5 requests per minute.
 * @type {import('express').RequestHandler}
 */
const aiGenerationBurstLimiter = createLimiter({
  points: 5,
  duration: 60, // 1 minute
  keyGenerator,
  errorMessage: 'You are making requests too quickly. Please slow down.',
});

/**
 * Conditional middleware that applies the appropriate long-term AI generation limiter.
 * It checks if the user is a guest and routes to the correct limiter (IP-based or User-based).
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {import('express').NextFunction} next - The Express next middleware function.
 */
const aiGenerationLimiter = (req, res, next) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return aiGenerationLimiterGuest(req, res, next);
  }
  return aiGenerationLimiterUser(req, res, next);
};

// --- Other Endpoint-Specific Limiters ---

/**
 * Rate limiter for the asynchronous task status polling endpoint.
 * Prevents clients from polling too frequently and causing unnecessary load.
 * Limit: 60 requests per minute.
 * @type {import('express').RequestHandler}
 */
const pollingLimiter = createLimiter({
  points: 60,
  duration: 60, // 1 minute
  keyGenerator,
  errorMessage: 'Too many status requests. Please poll less frequently.',
});

/**
 * Rate limiter for fetching conversation history (authenticated users only).
 * Protects the database from excessive read queries.
 * Limit: 120 requests per minute.
 * @type {import('express').RequestHandler}
 */
const historyLimiter = createLimiter({
  points: 120,
  duration: 60, // 1 minute
  keyGenerator: (req) => req.user?.userId || req.user?._id, // Authenticated only
  errorMessage: 'Too many history requests.',
});

/**
 * Rate limiter for the plan export functionality.
 * Exporting can be a heavier operation, so it has a more conservative limit.
 * Limit: 30 requests per hour.
 * @type {import('express').RequestHandler}
 */
const exportLimiter = createLimiter({
  points: 30,
  duration: 60 * 60, // 1 hour
  keyGenerator,
  errorMessage: 'You have reached your hourly limit for exporting plans.',
});

/**
 * @openapi
 * /api/v1/plan-generator/assistant:
 *   post:
 *     summary: Conversational Plan Generation (Sync)
 *     description: |
 *       Submits a message to the conversational AI to generate or continue a plan.
 *       This is a synchronous endpoint and will wait for the AI to respond.
 *       Supports both authenticated and guest users. Guests will receive a `userId` in the response to maintain conversation state.
 *       File uploads are supported via multipart/form-data.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *       - guest: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or prompt.
 *                 example: "Create a marketing plan for a new coffee shop."
 *               conversationId:
 *                 type: string
 *                 description: The ID of an existing conversation to continue. Omit for a new conversation.
 *                 example: "conv_12345"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: An optional file to upload as context for the message.
 *     responses:
 *       '200':
 *         description: Plan generation response generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     response:
 *                       type: string
 *                     plan:
 *                       type: object
 *                     userId:
 *                       type: string
 *                       description: "The generated guest user ID. Only present for guest users."
 *       '429':
 *         description: Too Many Requests. The user has exceeded the rate limit.
 *       '500':
 *         description: Internal Server Error.
 */
export const conversationalAssistant = [
  // Apply burst protection and long-term usage limits for this expensive AI endpoint.
  aiGenerationBurstLimiter,
  aiGenerationLimiter,
  catchAsync(async (req, res) => {
    const isGuest = req.isGuest || !req.user;
    // Determine userId based on authentication status.
    // For authenticated users, use their ID from req.user.
    // For guest users, generate a new guest ID.
    // The userId should never be taken from req.body to prevent IDOR (Insecure Direct Object Reference).
    let userId = isGuest
      ? planGeneratorService.generateGuestUserId()
      : req.user?.userId || req.user?._id;

    const { message, conversationId } = req.body;
    // Removed: userId = req.body.userId || userId;
    // This line allowed clients to override the userId, which is a security vulnerability (IDOR).
    // The userId must be derived from the authenticated session (req.user) or securely generated for guests,
    // not provided by the client in the request body.

    // Handle file upload if present
    const fileInfo = req.file
      ? {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
          location: req.file.location || req.file.path,
        }
      : null;

    logger.info(
      `Plan generator request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
      {
        hasFile: !!fileInfo,
        conversationId,
      }
    );

    const result = await planGeneratorService.conversationalAssistant(
      userId,
      message,
      conversationId,
      isGuest,
      fileInfo,
      req
    );

    // Include userId in response for guest users
    const responseData = isGuest ? { ...result, userId } : result;

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Plan generation response generated successfully',
      data: responseData,
    });
  }),
];

/**
 * @openapi
 * /api/v1/plan-generator/assistant-async:
 *   post:
 *     summary: Conversational Plan Generation (Async)
 *     description: |
 *       Initiates a plan generation task asynchronously. The server responds immediately with a task ID.
 *       The client can then use the `/task/{taskId}` endpoint to poll for the result.
 *       This is ideal for long-running generation tasks that might otherwise time out.
 *       Supports both authenticated and guest users.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *       - guest: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or prompt.
 *                 example: "Create a detailed 5-year business plan for a tech startup."
 *               conversationId:
 *                 type: string
 *                 description: The ID of an existing conversation to continue. Omit for a new conversation.
 *                 example: "conv_12345"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: An optional file to upload as context for the message.
 *     responses:
 *       '202':
 *         description: Plan generation task accepted and started.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskId:
 *                       type: string
 *                       description: The unique ID for the asynchronous task.
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     message:
 *                       type: string
 *                       example: "Plan generation started. Use /task/:taskId to check progress."
 *                     userId:
 *                       type: string
 *                       description: "The generated guest user ID. Only present for guest users."
 *       '429':
 *         description: Too Many Requests. The user has exceeded the rate limit.
 *       '500':
 *         description: Internal Server Error.
 */
export const conversationalAssistantAsync = [
  // Apply burst protection and long-term usage limits for this expensive AI endpoint.
  aiGenerationBurstLimiter,
  aiGenerationLimiter,
  catchAsync(async (req, res) => {
    const isGuest = req.isGuest || !req.user;
    // Determine userId based on authentication status.
    // For authenticated users, use their ID from req.user.
    // For guest users, generate a new guest ID.
    // The userId should never be taken from req.body to prevent IDOR.
    let userId = isGuest
      ? planGeneratorService.generateGuestUserId()
      : req.user?.userId || req.user?._id;

    const { message, conversationId } = req.body;
    // Removed: userId = req.body.userId || userId;
    // This line allowed clients to override the userId, which is a security vulnerability (IDOR).
    // The userId must be derived from the authenticated session (req.user) or securely generated for guests,
    // not provided by the client in the request body.

    // Handle file upload if present
    const fileInfo = req.file
      ? {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
          location: req.file.location || req.file.path,
        }
      : null;

    logger.info(
      `Async plan generator request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
      {
        hasFile: !!fileInfo,
        conversationId,
      }
    );

    // Create task
    const task = taskManager.createTask(userId, conversationId);

    // Start async processing (don't await)
    taskManager
      .processTask(
        task.taskId,
        userId,
        message,
        conversationId,
        isGuest,
        fileInfo
      )
      .catch((error) => {
        logger.error('Async task processing error:', error);
      });

    // Return immediately with task ID
    const responseData = {
      taskId: task.taskId,
      status: task.status,
      message: 'Plan generation started. Use /task/:taskId to check progress.',
      userId: isGuest ? userId : undefined, // Include userId for guest users in the response
    };

    sendResponse(res, {
      statusCode: httpStatus.ACCEPTED,
      success: true,
      message: 'Plan generation started successfully',
      data: responseData,
    });
  }),
];

/**
 * @openapi
 * /api/v1/plan-generator/task/{taskId}:
 *   get:
 *     summary: Get Asynchronous Task Status
 *     description: Polls for the status and result of an asynchronous plan generation task.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *       - guest: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the task to check.
 *     responses:
 *       '200':
 *         description: Task status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, processing, completed, failed]
 *                     stage:
 *                       type: string
 *                       description: "The current processing stage of the task."
 *                     progress:
 *                       type: number
 *                       description: "A percentage indicating task completion (0-100)."
 *                     message:
 *                       type: string
 *                       description: "A human-readable message about the current status."
 *                     result:
 *                       type: object
 *                       description: "The final result of the task. Only present when status is 'completed'."
 *                     error:
 *                       type: string
 *                       description: "Error message if the task failed. Only present when status is 'failed'."
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     startedAt:
 *                       type: string
 *                       format: date-time
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *       '404':
 *         description: Task not found.
 *       '429':
 *         description: Too many status requests. Please poll less frequently.
 */
export const getTaskStatus = [
  // Protect against excessive polling.
  pollingLimiter,
  catchAsync(async (req, res) => {
    const { taskId } = req.params;

    const task = taskManager.getTask(taskId);

    if (!task) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Task not found',
        data: null,
      });
    }

    // Return task status and result
    const responseData = {
      taskId: task.taskId,
      status: task.status,
      stage: task.stage,
      progress: task.progress,
      message: task.message,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Task status retrieved successfully',
      data: responseData,
    });
  }),
];

/**
 * @openapi
 * /api/v1/plan-generator/direct:
 *   post:
 *     summary: Direct Plan Generation
 *     description: |
 *       Generates a plan directly from a set of structured parameters, bypassing the conversational interface.
 *       This is useful for programmatic access or integrations.
 *       Supports both authenticated and guest users.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *       - guest: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: A flexible object containing all necessary parameters for direct plan generation. The specific properties depend on the plan type.
 *             example:
 *               planType: "marketing"
 *               companyName: "The Daily Grind"
 *               targetAudience: "Urban professionals aged 25-40"
 *               budget: 5000
 *     responses:
 *       '200':
 *         description: Plan generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The generated plan object.
 *       '429':
 *         description: Too Many Requests. The user has exceeded the rate limit.
 *       '500':
 *         description: Internal Server Error.
 */
export const generatePlan = [
  // Apply burst protection and long-term usage limits for this expensive AI endpoint.
  aiGenerationBurstLimiter,
  aiGenerationLimiter,
  catchAsync(async (req, res) => {
    const isGuest = req.isGuest || !req.user;
    const userId = isGuest
      ? planGeneratorService.generateGuestUserId()
      : req.user?.userId || req.user?._id;

    const params = req.body;

    logger.info(
      `Direct plan generation from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
    );

    const result = await planGeneratorService.generatePlanDirect(
      params,
      userId,
      isGuest
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Plan generated successfully',
      data: result,
    });
  }),
];

/**
 * @openapi
 * /api/v1/plan-generator/history/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: |
 *       Retrieves the full message history for a given conversation.
 *       This endpoint requires authentication, as users can only access their own conversations.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve.
 *     responses:
 *       '200':
 *         description: Conversation history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                       content:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *       '401':
 *         description: Unauthorized. User is not authenticated.
 *       '403':
 *         description: Forbidden. User does not have permission to access this conversation.
 *       '404':
 *         description: Conversation not found.
 *       '429':
 *         description: Too Many Requests.
 */
export const getConversationHistory = [
  // Protect database with standard API rate limits.
  historyLimiter,
  catchAsync(async (req, res) => {
    const { conversationId } = req.params;
    // For authenticated users, userId comes from req.user.
    // For guest users, the userId should be derived from a secure guest session mechanism
    // or implicitly handled by the service based on conversationId.
    // It should not be taken from req.body to prevent IDOR.
    const userId = req.user?.userId || req.user?._id;

    logger.info(`Fetching conversation history: ${conversationId}`);

    const result = await planGeneratorService.getConversationHistory(
      conversationId,
      userId, // userId will be undefined for guests if not set in req.user, service must handle this.
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: result,
    });
  }),
];

/**
 * @openapi
 * /api/v1/plan-generator/export:
 *   post:
 *     summary: Export a Plan
 *     description: |
 *       Exports the final plan from a conversation in a specified format (e.g., markdown, PDF).
 *       The user must have access to the conversation to export it.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *       - guest: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conversationId:
 *                 type: string
 *                 description: The ID of the conversation containing the plan to export.
 *                 example: "conv_12345"
 *               format:
 *                 type: string
 *                 description: The desired export format.
 *                 enum: [markdown, pdf, docx]
 *                 default: markdown
 *     responses:
 *       '200':
 *         description: Plan exported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     format:
 *                       type: string
 *                     content:
 *                       type: string
 *                       description: "The exported plan content, potentially base64 encoded for binary formats."
 *       '400':
 *         description: Bad Request. Invalid format or missing conversationId.
 *       '403':
 *         description: Forbidden. User does not have permission to export this plan.
 *       '429':
 *         description: You have reached your hourly limit for exporting plans.
 */
export const exportPlan = [
  // Protect this potentially heavy operation with a conservative limit.
  exportLimiter,
  catchAsync(async (req, res) => {
    // Determine userId based on authentication status.
    // For authenticated users, use their ID from req.user.
    // For guest users, the userId should NOT be taken from req.body to prevent IDOR.
    // If req.user is null (guest), userId will be undefined. The service layer
    // (planGeneratorService.exportPlan) must then handle guest authorization
    // by either inferring the guest's userId from a secure session (e.g., cookie)
    // or by validating ownership of the conversationId without a direct userId.
    const userId = req.user?.userId || req.user?._id;

    const { conversationId, format = 'markdown' } = req.body;

    logger.info(`Exporting plan: ${conversationId} in ${format} format`);

    const result = await planGeneratorService.exportPlan(
      conversationId,
      userId, // userId will be undefined for guests if not set in req.user, service must handle this.
      format,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Plan exported successfully',
      data: result,
    });
  }),
];

/**
 * @openapi
 * /api/v1/plan-generator/brainstorm:
 *   post:
 *     summary: Brainstorm an Idea
 *     description: |
 *       Analyzes a user-provided idea and generates a brainstormed list of related concepts, aspects, and potential directions.
 *       This is a specialized AI endpoint for creative exploration before committing to a full plan.
 *     tags:
 *       - Plan Generator
 *     security:
 *       - bearerAuth: []
 *       - guest: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               idea:
 *                 type: string
 *                 description: The core idea or topic to brainstorm.
 *                 example: "An app that uses AI to create personalized travel itineraries."
 *               aspects:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional list of specific aspects to focus on during brainstorming.
 *                 example: ["monetization", "target audience", "unique features"]
 *               context:
 *                 type: object
 *                 description: Optional additional context for the brainstorming session.
 *                 example:
 *                   budget: "low"
 *                   teamSize: "small"
 *     responses:
 *       '200':
 *         description: Brainstorming completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     analysis:
 *                       type: object
 *                       description: "An initial analysis of the provided idea."
 *                     brainstorm:
 *                       type: object
 *                       description: "The generated brainstorming results."
 *       '429':
 *         description: Too Many Requests. The user has exceeded the rate limit.
 *       '500':
 *         description: Internal Server Error.
 */
export const brainstormIdea = [
  // Apply burst protection and long-term usage limits for this expensive AI endpoint.
  aiGenerationBurstLimiter,
  aiGenerationLimiter,
  catchAsync(async (req, res) => {
    const { idea, aspects, context } = req.body;
    const isGuest = req.isGuest || !req.user;
    const userId = isGuest
      ? planGeneratorService.generateGuestUserId()
      : req.user?.userId || req.user?._id;

    logger.info(
      `Brainstorm request from ${isGuest ? 'guest' : 'authenticated'} user`
    );

    // Import services dynamically for performance
    const { ideaAnalyzer } = await import('./services/ideaAnalyzer.js');
    const { brainstormEngine } = await import('./services/brainstormEngine.js');

    // Analyze idea first
    const analysis = await ideaAnalyzer.analyzeIdea(idea);

    // Generate brainstorm
    const brainstorm = await brainstormEngine.generateBrainstorm(
      idea,
      analysis,
      aspects || [],
      context || {}
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorming completed successfully',
      data: {
        analysis,
        brainstorm,
      },
    });
  }),
];

/**
 * An object containing all controller functions for the Plan Generator module.
 * These functions handle incoming HTTP requests, apply middleware like rate limiting,
 * and delegate business logic to the `planGeneratorService`.
 * @namespace planGeneratorController
 */
export const planGeneratorController = {
  conversationalAssistant,
  conversationalAssistantAsync,
  getTaskStatus,
  generatePlan,
  getConversationHistory,
  exportPlan,
  brainstormIdea,
};