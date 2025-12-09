import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentService } from './document.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational document drafting assistant endpoint
 * Handles natural language requests for document generation
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? documentService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

  logger.info(
    `Document assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(conversationId, userId)
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your document generation limit for this month. Please upgrade your plan to continue.',
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
    const result = await documentService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest
    );

    logger.info('Document assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsMoreInfo: result.needsMoreInfo,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
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
      },
    });
  }
});

/**
 * Direct document generation endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
export const generateDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? documentService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const params = req.body;

  logger.info('Direct document generation request', {
    userId,
    documentType: params.documentType,
    outputFormat: params.outputFormat,
  });

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });

    if (!userSubscription || userSubscription.usage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document generation limit. Please upgrade your plan.',
      });
    }
  }

  try {
    const result = await documentService.generateDocument(params, userId, isGuest);

    logger.info('Document generated successfully', {
      userId,
      format: result.document.format,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Document generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error generating document:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate document',
    });
  }
});

/**
 * Export existing document to different format
 */
export const exportDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? documentService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { documentId, outputFormat } = req.body;

  logger.info('Document export request', {
    userId,
    documentId,
    outputFormat,
  });

  try {
    // In a real implementation, you would retrieve the document from database
    // For now, return an appropriate message
    return sendResponse(res, {
      statusCode: httpStatus.NOT_IMPLEMENTED,
      success: false,
      message: 'Document export from stored documents is not yet implemented. Please use the generate endpoint with your content.',
    });
  } catch (error) {
    logger.error('Error exporting document:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to export document',
    });
  }
});

/**
 * Edit/refine existing document
 */
export const editDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? documentService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { documentId, editInstructions, outputFormat } = req.body;

  logger.info('Document edit request', {
    userId,
    documentId,
  });

  try {
    // In a real implementation, retrieve document, apply edits, and re-export
    return sendResponse(res, {
      statusCode: httpStatus.NOT_IMPLEMENTED,
      success: false,
      message: 'Document editing is not yet implemented. Please use the conversational assistant for document modifications.',
    });
  } catch (error) {
    logger.error('Error editing document:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to edit document',
    });
  }
});

export const documentController = {
  conversationalAssistant,
  generateDocument,
  exportDocument,
  editDocument,
};
