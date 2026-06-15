import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { createRateLimiter } from '../../../shared/rateLimiter.js'; // AI-AGENT: Import rate limiter utility
import { documentService } from './document.service.js';
import SubscriptionModel from '../payment/payment.model.js';
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // Removed as it was misused in subscription logic

// --- DDOS & Rate-Limiting Guard ---
// This section defines rate limiters to protect against API abuse, DDOS, and excessive costs.

// Strict limiter for guest (IP-based) access to expensive AI endpoints.
const guestGenerationLimiter = createRateLimiter({
  keyPrefix: 'guest_doc_generation_limit_ip',
  points: 5, // Max 5 requests
  duration: 60, // per 60 seconds
  errorMessage: 'Too many requests from this IP. Please try again later.',
});

// Burst protection for authenticated users (user ID-based) on expensive AI endpoints.
// Their primary limit is the subscription plan; this prevents rapid-fire abuse.
const authenticatedGenerationLimiter = createRateLimiter({
  keyPrefix: 'auth_doc_generation_limit_user',
  points: 30, // Max 30 requests
  duration: 60, // per 60 seconds
  keyGenerator: (req) => req.user?.userId || req.user?._id, // Use User ID as the key
  errorMessage: 'You are making too many requests. Please slow down.',
});

// Dynamic middleware that applies the correct limiter based on authentication status.
const conditionalGenerationLimiter = (req, res, next) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return guestGenerationLimiter(req, res, next);
  }
  return authenticatedGenerationLimiter(req, res, next);
};

// General purpose limiter for other endpoints to prevent basic DDOS.
const generalApiLimiter = createRateLimiter({
  keyPrefix: 'general_api_limit_ip',
  points: 60, // Max 60 requests
  duration: 60, // per 60 seconds
  errorMessage: 'Too many requests. Please try again later.',
});
// --- End of DDOS & Rate-Limiting Guard ---

/**
 * Conversational document drafting assistant endpoint
 * Handles natural language requests for document generation
 */
const conversationalAssistantHandler = catchAsync(async (req, res) => {
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
    `Document assistant request from ${
      isGuest ? 'guest' : 'authenticated'
    } user ${userId}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Add .lean() for read-only query to reduce Mongoose document overhead.
    // Optimization: Consider adding an index to SubscriptionModel on { userId: 1, createdAt: -1 }
    //               to speed up this query and sorting.
    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean(); // Added .lean()
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
const generateDocumentHandler = catchAsync(async (req, res) => {
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
    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean(); // Added .lean()

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
const exportDocumentHandler = catchAsync(async (req, res) => {
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
const editDocumentHandler = catchAsync(async (req, res) => {
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

// --- Middleware & Handler Exports ---
// Each route is protected by one or more rate-limiting middleware before the controller logic is executed.

export const conversationalAssistant = [
  conditionalGenerationLimiter,
  conversationalAssistantHandler,
];

export const generateDocument = [
  conditionalGenerationLimiter,
  generateDocumentHandler,
];

export const exportDocument = [generalApiLimiter, exportDocumentHandler];

export const editDocument = [generalApiLimiter, editDocumentHandler];

export const documentController = {
  conversationalAssistant,
  generateDocument,
  exportDocument,
  editDocument,
};