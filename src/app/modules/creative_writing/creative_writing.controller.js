import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { creativeWritingService } from './creative_writing.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational creative writing assistant endpoint
 * Handles natural language requests for creative writing
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  console.log('Is Guest:', isGuest);

  let userId = isGuest
    ? creativeWritingService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  console.log('User ID:', userId);

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;
  console.log('Final User ID:', userId);

  logger.info(
    `Creative writing assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      conversationId,
      messageLength: message?.length,
    }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        )
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your creative writing limit for this month. Please upgrade your plan to continue.',
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
    const result = await creativeWritingService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest,
      req
    );

    logger.info('Creative writing assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsClarification: result.needsClarification,
      writingType: result.writingParams?.writingType,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Error in creative writing assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message ||
        'An error occurred while processing your creative writing request',
    });
  }
});

/**
 * Get conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  logger.info('Getting creative writing conversation history', {
    userId,
    conversationId,
  });

  try {
    const conversation = await creativeWritingService.getConversationHistory(
      conversationId,
      userId,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error getting conversation history:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.NOT_FOUND,
      success: false,
      message: error.message || 'Conversation not found',
    });
  }
});

export const creativeWritingController = {
  conversationalAssistant,
  getConversationHistory,
};
