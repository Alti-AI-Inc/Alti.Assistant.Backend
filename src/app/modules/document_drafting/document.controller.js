import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentService } from './document.service.js';
import SubscriptionModel from '../payment/payment.model.js';
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // Removed as it was misused in subscription logic

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
  // SECURITY FIX: Removed potential IDOR vulnerability.
  // An authenticated user should not be able to override their userId from the request body.
  // The userId must be derived from the authenticated session (req.user) or generated for guests.
  // userId = req.body.userId || userId;

  logger.info(
    `Document assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Add .lean() for read-only query to reduce Mongoose document overhead.
    // Optimization: Consider adding an index to SubscriptionModel on { userId: 1, createdAt: -1 }
    //               to speed up this query and sorting.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean(); // Added .lean()
    const promptUsage = userSubscription ? userSubscription.usage : 0;

    // BUG FIX: Corrected subscription limit check logic.
    // The previous logic involving `totalConversationWithConvId` was incorrect
    // as `conversationHelpers.getConversationById` likely returns an object, not a count,
    // and the comparison `promptUsage <= totalConversationWithConvId` was flawed.
    // Assuming `userSubscription.usage` represents the remaining prompts/generations for the month.
    if (promptUsage <= 0) {
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

    // BUG FIX: Decrement usage for authenticated users after a successful request.
    // This ensures that the subscription limits are enforced correctly over time.
    if (!isGuest) {
      // Find and update the latest subscription for the user, decrementing the usage count.
      await SubscriptionModel.findOneAndUpdate(
        { userId },
        { $inc: { usage: -1 } },
        { sort: { createdAt: -1 }, new: true } // `new: true` returns the updated document, though not strictly needed here.
      );
    }

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
      message:
        error.message || 'An error occurred while processing your request',
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
    // Optimization: Add .lean() for read-only query to reduce Mongoose document overhead.
    // Optimization: Consider adding an index to SubscriptionModel on { userId: 1, createdAt: -1 }
    //               to speed up this query and sorting.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean(); // Added .lean()

    // Assuming userSubscription.usage represents the remaining generations.
    if (!userSubscription || userSubscription.usage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your document generation limit. Please upgrade your plan.',
      });
    }
  }

  try {
    const result = await documentService.generateDocument(
      params,
      userId,
      isGuest,
      req
    );

    // BUG FIX: Decrement usage for authenticated users after a successful request.
    // This ensures that the subscription limits are enforced correctly over time.
    if (!isGuest) {
      // Find and update the latest subscription for the user, decrementing the usage count.
      await SubscriptionModel.findOneAndUpdate(
        { userId },
        { $inc: { usage: -1 } },
        { sort: { createdAt: -1 }, new: true }
      );
    }

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
      message:
        'Document export from stored documents is not yet implemented. Please use the generate endpoint with your content.',
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
      message:
        'Document editing is not yet implemented. Please use the conversational assistant for document modifications.',
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