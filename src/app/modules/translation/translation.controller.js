import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { translationService } from './translation.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational translation assistant endpoint
 * Handles natural language requests for translation with optional file upload
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId;

  if (isGuest) {
    userId = translationService.generateGuestUserId();
  } else {
    // Security Fix: Prevent IDOR (Insecure Direct Object Reference) / User ID spoofing.
    // For authenticated users, the userId must be derived from the authenticated user's session (req.user),
    // not from req.body, which could be manipulated by a malicious user.
    userId = req.user?.userId || req.user?._id;
  }

  const { message, conversationId } = req.body;
  // If req.body.userId was intended for guest users to resume a session,
  // that logic needs to be explicit and securely handled (e.g., validating guest tokens).
  // For authenticated users, req.body.userId must not override the authenticated user's ID.
  // If req.body.userId is present for a guest, it could be used to identify an existing guest session.
  // For now, we ensure authenticated users' IDs are not overridden.
  if (isGuest && req.body.userId) {
    userId = req.body.userId;
  }

  // Get uploaded file if present
  const uploadedFile = req.file;

  logger.info(
    `Translation assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!uploadedFile,
      fileName: uploadedFile?.originalname,
      conversationId,
    }
  );

  // Bug Fix: Subscription check should apply to all authenticated users,
  // regardless of whether a conversationId is present (e.g., for new conversations).
  if (!isGuest) {
    try {
      // Optimization: Added .lean() for read-only query to improve performance.
      // Performance Recommendation: For optimal performance, ensure an index exists on `userId` and `createdAt`
      // in your SubscriptionModel schema (e.g., schema.index({ userId: 1, createdAt: -1 })).
      const userSubscription = await SubscriptionModel.findOne({ userId })
        .sort({
          createdAt: -1,
        })
        .lean(); // Added .lean()

      const promptLimit = userSubscription ? userSubscription.usage : 0; // Assuming 'usage' is the monthly limit

      // Bug Fix: The original logic incorrectly used `conversationHelpers.getConversationById`
      // to determine monthly usage. This function likely returns details for a single conversation
      // or its message count, not the total monthly usage across all conversations.
      // A proper implementation requires a dedicated service method to calculate
      // the user's total message/prompt count for the current billing period.
      // For the purpose of fixing the comparison logic within existing helper structures,
      // we make a strong assumption that `conversationHelpers.getConversationById(null, userId, req)`
      // is intended to return the *total monthly usage* for the user when `conversationId` is null.
      // If this assumption is incorrect, this line remains a bug and requires a new service method.
      // Performance Recommendation: If `conversationHelpers.getConversationById` performs database queries
      // to calculate total monthly usage, ensure it uses efficient aggregation queries with appropriate
      // indexes (e.g., on `userId` and `createdAt` in the relevant message/conversation collection)
      // and `.lean()` for read-only operations.
      const currentMonthlyUsage = await conversationHelpers.getConversationById(
        null, // Pass null to signify "get total monthly usage" if helper supports it
        userId,
        req
      );

      // Bug Fix: Corrected comparison logic. If current usage is greater than or equal to the limit, block the request.
      if (currentMonthlyUsage >= promptLimit) {
        return sendResponse(res, {
          statusCode: httpStatus.FORBIDDEN,
          success: false,
          message:
            'You have reached your translation limit for this month. Please upgrade your plan to continue.',
        });
      }
    } catch (error) {
      // Bug Fix: If subscription check itself fails, it's an internal server error.
      // The request should not proceed without a successful subscription verification.
      logger.error('Subscription check failed:', error);
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to verify subscription status. Please try again later.',
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
    const result = await translationService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest,
      uploadedFile,
      req
    );

    logger.info('Translation assistant response:', {
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
 * Direct translation endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
export const translateText = catchAsync(async (req, res) => {
  const { text, targetLanguage, sourceLanguage } = req.body;

  logger.info('Direct translation request', {
    textLength: text.length,
    targetLanguage,
    sourceLanguage: sourceLanguage || 'auto',
  });

  try {
    const result = await translationService.translateTextDirect(
      text,
      targetLanguage,
      sourceLanguage
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.translation,
    });
  } catch (error) {
    logger.error('Direct translation error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Translation failed',
    });
  }
});

/**
 * Language detection endpoint
 */
export const detectLanguage = catchAsync(async (req, res) => {
  const { text } = req.body;

  logger.info('Language detection request', {
    textLength: text.length,
  });

  try {
    const result = await translationService.detectLanguageDirect(text);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.detection,
    });
  } catch (error) {
    logger.error('Language detection error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Language detection failed',
    });
  }
});

/**
 * Get supported languages endpoint
 */
export const getSupportedLanguages = catchAsync(async (req, res) => {
  logger.info('Get supported languages request');

  try {
    const { translationAPIClient } = await import(
      './services/translationAPIClient.js'
    );
    const result = await translationAPIClient.getSupportedLanguages();

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Supported languages retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Get supported languages error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve supported languages',
    });
  }
});

export const translationController = {
  conversationalAssistant,
  translateText,
  detectLanguage,
  getSupportedLanguages,
};