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

// Default key generator for rate limiters.
// Uses the authenticated user's ID for logged-in users to track usage per account.
// Falls back to the request's IP address for guest (unauthenticated) users.
const keyGenerator = (req) => req.user?.userId || req.user?._id || req.ip;

// --- AI Generation Limiters (for expensive, resource-intensive endpoints) ---

// Stricter limits for GUEST users (IP-based) on expensive AI endpoints.
// This prevents anonymous abuse and encourages user registration.
// Limit: 10 requests per hour per IP.
const aiGenerationLimiterGuest = createLimiter({
  points: 10,
  duration: 60 * 60, // 1 hour
  keyGenerator: (req) => req.ip, // Explicitly key by IP for guests
  errorMessage:
    'Too many plan generation requests. Please create an account or try again later.',
});

// Generous limits for AUTHENTICATED users (User ID-based) on expensive AI endpoints.
// In a production system, these points could be tied to subscription tiers.
// Limit: 200 requests per day per user.
const aiGenerationLimiterUser = createLimiter({
  points: 200,
  duration: 24 * 60 * 60, // 1 day
  keyGenerator: (req) => req.user?.userId || req.user?._id, // Explicitly key by user ID
  errorMessage: 'You have reached your daily limit for plan generation.',
});

// Burst protection for all users on AI endpoints to prevent rapid-fire requests
// that can spike server load or API costs.
// Limit: 5 requests per minute.
const aiGenerationBurstLimiter = createLimiter({
  points: 5,
  duration: 60, // 1 minute
  keyGenerator,
  errorMessage: 'You are making requests too quickly. Please slow down.',
});

// Conditional middleware that applies the appropriate long-term AI generation limiter.
// It checks if the user is a guest and routes to the correct limiter (IP-based or User-based).
const aiGenerationLimiter = (req, res, next) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return aiGenerationLimiterGuest(req, res, next);
  }
  return aiGenerationLimiterUser(req, res, next);
};

// --- Other Endpoint-Specific Limiters ---

// Rate limiter for the asynchronous task status polling endpoint.
// Prevents clients from polling too frequently and causing unnecessary load.
// Limit: 60 requests per minute.
const pollingLimiter = createLimiter({
  points: 60,
  duration: 60, // 1 minute
  keyGenerator,
  errorMessage: 'Too many status requests. Please poll less frequently.',
});

// Rate limiter for fetching conversation history (authenticated users only).
// Protects the database from excessive read queries.
// Limit: 120 requests per minute.
const historyLimiter = createLimiter({
  points: 120,
  duration: 60, // 1 minute
  keyGenerator: (req) => req.user?.userId || req.user?._id, // Authenticated only
  errorMessage: 'Too many history requests.',
});

// Rate limiter for the plan export functionality.
// Exporting can be a heavier operation, so it has a more conservative limit.
// Limit: 30 requests per hour.
const exportLimiter = createLimiter({
  points: 30,
  duration: 60 * 60, // 1 hour
  keyGenerator,
  errorMessage: 'You have reached your hourly limit for exporting plans.',
});

/**
 * Conversational plan generation assistant endpoint
 * Handles natural language requests for plan generation
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
 * Async conversational plan generation assistant endpoint
 * Starts plan generation asynchronously and returns task ID
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
 * Get task status and result
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
 * Direct plan generation endpoint (non-conversational)
 * For programmatic access with all parameters
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
 * Get conversation history
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
 * Export plan in various formats
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
 * Brainstorm only endpoint
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

export const planGeneratorController = {
  conversationalAssistant,
  conversationalAssistantAsync,
  getTaskStatus,
  generatePlan,
  getConversationHistory,
  exportPlan,
  brainstormIdea,
};