import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { brainstormService } from './brainstorm.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational brainstorm assistant endpoint
 * Handles natural language requests for brainstorming
 */
const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? brainstormService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

  logger.info(
    `Brainstorm assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    { conversationId }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(conversationId, userId, req)
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await brainstormService.processConversationalBrainstorm(
      userId,
      message,
      conversationId,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to process brainstorm request',
    });
  }
});

/**
 * Structured brainstorm generation endpoint
 * For programmatic access with explicit parameters
 */
const generateBrainstorm = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? brainstormService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  userId = req.body.userId || userId;

  logger.info(
    `Structured brainstorm request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });

    if (userSubscription && userSubscription.usage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await brainstormService.generateStructuredBrainstorm(userId, req.body, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorm generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error generating structured brainstorm:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate brainstorm',
    });
  }
});

/**
 * Get conversation history
 */
const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    const result = await brainstormService.getConversationHistory(conversationId, userId, req);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to retrieve conversation history',
    });
  }
});

/**
 * Export brainstorm session
 */
const exportBrainstorm = catchAsync(async (req, res) => {
  const { conversationId, format = 'markdown', includeHistory = true } = req.body;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Exporting brainstorm session ${conversationId} as ${format}`);

  try {
    const result = await brainstormService.exportBrainstormSession(
      conversationId,
      userId,
      format,
      includeHistory,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorm session exported successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error exporting brainstorm session:', error);
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to export brainstorm session',
    });
  }
});

/**
 * Refine existing brainstorm
 */
const refineBrainstorm = catchAsync(async (req, res) => {
  const { conversationId, message, focusOn = [] } = req.body;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Refining brainstorm in conversation ${conversationId}`);

  try {
    const result = await brainstormService.refineBrainstorm(
      conversationId,
      userId,
      message,
      focusOn,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorm refined successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error refining brainstorm:', error);
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to refine brainstorm',
    });
  }
});

export const brainstormController = {
  conversationalAssistant,
  generateBrainstorm,
  getConversationHistory,
  exportBrainstorm,
  refineBrainstorm,
};
