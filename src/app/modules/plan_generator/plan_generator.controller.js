import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { planGeneratorService } from './plan_generator.service.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { taskManager } from './plan_generator.taskmanager.js';

/**
 * Conversational plan generation assistant endpoint
 * Handles natural language requests for plan generation
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? planGeneratorService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

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
  const responseData = isGuest
    ? { ...result, userId }
    : result;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Plan generation response generated successfully',
    data: responseData,
  });
});

/**
 * Async conversational plan generation assistant endpoint
 * Starts plan generation asynchronously and returns task ID
 */
export const conversationalAssistantAsync = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? planGeneratorService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

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
  taskManager.processTask(
    task.taskId,
    userId,
    message,
    conversationId,
    isGuest,
    fileInfo
  ).catch(error => {
    logger.error('Async task processing error:', error);
  });

  // Return immediately with task ID
  const responseData = {
    taskId: task.taskId,
    status: task.status,
    message: 'Plan generation started. Use /task/:taskId to check progress.',
    userId: isGuest ? userId : undefined,
  };

  sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Plan generation started successfully',
    data: responseData,
  });
});

/**
 * Get task status and result
 */
export const getTaskStatus = catchAsync(async (req, res) => {
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
});

/**
 * Direct plan generation endpoint (non-conversational)
 * For programmatic access with all parameters
 */
export const generatePlan = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? planGeneratorService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const params = req.body;

  logger.info(`Direct plan generation from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`);

  const result = await planGeneratorService.generatePlanDirect(params, userId, isGuest);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Plan generated successfully',
    data: result,
  });
});

/**
 * Get conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history: ${conversationId}`);

  const result = await planGeneratorService.getConversationHistory(conversationId, userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation history retrieved successfully',
    data: result,
  });
});

/**
 * Export plan in various formats
 */
export const exportPlan = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? req.body.userId
    : req.user?.userId || req.user?._id;

  const { conversationId, format = 'markdown' } = req.body;

  logger.info(`Exporting plan: ${conversationId} in ${format} format`);

  const result = await planGeneratorService.exportPlan(conversationId, userId, format, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Plan exported successfully',
    data: result,
  });
});

/**
 * Brainstorm only endpoint
 */
export const brainstormIdea = catchAsync(async (req, res) => {
  const { idea, aspects, context } = req.body;
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? planGeneratorService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  logger.info(`Brainstorm request from ${isGuest ? 'guest' : 'authenticated'} user`);

  // Import services
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
});

export const planGeneratorController = {
  conversationalAssistant,
  conversationalAssistantAsync,
  getTaskStatus,
  generatePlan,
  getConversationHistory,
  exportPlan,
  brainstormIdea,
};
