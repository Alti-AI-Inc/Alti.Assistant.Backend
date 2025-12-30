import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { articleWriterService } from './article_writer.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational article writer assistant endpoint
 * Handles natural language requests for article writing with file upload
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  console.log('Is Guest:', isGuest);
  let userId = isGuest
    ? articleWriterService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  console.log('User ID:', userId);

  const { message, conversationId, articleType, tone, length } = req.body;
  userId = req.body.userId || userId;
  console.log('Final User ID:', userId);

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
    `Article writer request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      conversationId,
      articleType,
      tone,
      length,
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
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your article writing limit for this month. Please upgrade your plan to continue.',
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
    const result = await articleWriterService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      isGuest,
      articleType,
      tone,
      length
    );

    logger.info(`Article generated successfully for conversation ${result.conversationId}`);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Article generated successfully',
      data: {
        ...result,
        isGuest: isGuest,
      },
    });
  } catch (error) {
    logger.error('Error in conversational article writer:', error);

    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate article',
    });
  }
});

/**
 * Get conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    const conversation = await articleWriterService.getConversationHistory(conversationId, userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);

    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to fetch conversation history',
    });
  }
});

export const articleWriterController = {
  conversationalAssistant,
  getConversationHistory,
};
