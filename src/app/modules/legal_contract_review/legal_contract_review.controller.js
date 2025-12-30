import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { legalContractReviewService } from './legal_contract_review.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational legal contract review assistant endpoint
 * Handles natural language requests for contract review with file upload or text input
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? legalContractReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, outputFormat } = req.body;
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
    `Legal contract review request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      conversationId,
      outputFormat,
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
          'You have reached your legal contract review limit for this month. Please upgrade your plan to continue.',
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
    const result = await legalContractReviewService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      outputFormat || 'text',
      isGuest
    );

    logger.info('Legal contract review assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsContract: result.needsContract,
      needsMoreInfo: result.needsMoreInfo,
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
    logger.error('Error in conversational assistant:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to process contract review request',
    });
  }
});

/**
 * Direct contract review endpoint (non-conversational)
 * For programmatic access with all parameters
 */
export const reviewContract = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? legalContractReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const reviewParams = req.body;

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

  if (!fileInfo && !reviewParams.contractText) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Contract file or contract text is required',
    });
  }

  logger.info(`Direct contract review request from user ${userId}`, {
    hasFile: !!fileInfo,
    reviewType: reviewParams.reviewType,
  });

  try {
    const result = await legalContractReviewService.reviewContract(
      fileInfo,
      reviewParams,
      userId,
      isGuest
    );

    logger.info('Contract review completed', {
      userId,
      success: result.success,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Contract review completed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in direct contract review:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to review contract',
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
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        messages: conversation.messages,
        metadata: conversation.metadata,
        contracts_metadata: conversation.contracts_metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to fetch conversation history',
    });
  }
});

export const legalContractReviewController = {
  conversationalAssistant,
  reviewContract,
  getConversationHistory,
};
