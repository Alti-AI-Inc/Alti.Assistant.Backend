import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentReviewService } from './document_review.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational document review assistant endpoint
 * Handles natural language requests for document review with file upload
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  console.log('Is Guest:', isGuest);
  let userId = isGuest
    ? documentReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  console.log('User ID:', userId);
  const { message, conversationId } = req.body;
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
    `Document review assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
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
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your document review limit for this month. Please upgrade your plan to continue.',
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
    const result = await documentReviewService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      isGuest
    );

    logger.info('Document review assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsFile: result.needsFile,
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
      message: error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Direct review endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
export const reviewDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? documentReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  userId = req.body.userId || userId;

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const promptUsage = userSubscription ? userSubscription.usage : 0;

    if (promptUsage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your document review limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  // Handle file upload
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

  if (!fileInfo) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Document file is required',
    });
  }

  const reviewParams = {
    reviewType: req.body.reviewType,
    reviewDepth: req.body.reviewDepth,
    documentType: req.body.documentType,
    aspects: req.body.aspects,
    additionalInstructions: req.body.additionalInstructions,
  };

  logger.info('Direct document review request', {
    userId,
    filename: fileInfo.originalName,
    reviewType: reviewParams.reviewType,
  });

  try {
    const result = await documentReviewService.reviewDocument(
      fileInfo,
      reviewParams,
      userId,
      isGuest
    );

    logger.info('Document review completed successfully');

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Document reviewed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Error in direct document review:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to review document',
      data: {
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Get conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

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
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to fetch conversation history',
    });
  }
});

export const documentReviewController = {
  conversationalAssistant,
  reviewDocument,
  getConversationHistory,
};
