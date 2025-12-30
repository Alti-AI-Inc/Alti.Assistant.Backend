import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { planGeneratorService } from './plan_generator.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

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

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(conversationId, userId)
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.PAYMENT_REQUIRED,
        success: false,
        message: 'Subscription limit reached. Please upgrade your plan.',
        data: null,
      });
    }
  }

  const result = await planGeneratorService.conversationalAssistant(
    userId,
    message,
    conversationId,
    isGuest,
    fileInfo
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

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const promptUsage = userSubscription ? userSubscription.usage : 0;

    if (promptUsage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.PAYMENT_REQUIRED,
        success: false,
        message: 'Subscription limit reached. Please upgrade your plan.',
        data: null,
      });
    }
  }

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

  const result = await planGeneratorService.getConversationHistory(conversationId, userId);

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

  const result = await planGeneratorService.exportPlan(conversationId, userId, format);

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
  generatePlan,
  getConversationHistory,
  exportPlan,
  brainstormIdea,
};
