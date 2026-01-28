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
  let userId = isGuest
    ? translationService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

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

  // Check subscription limits for authenticated users
  if (!isGuest && conversationId) {
    try {
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
            'You have reached your translation limit for this month. Please upgrade your plan to continue.',
        });
      }
    } catch (error) {
      logger.warn('Subscription check failed:', error.message);
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
      uploadedFile
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
      message: error.message || 'An error occurred while processing your request',
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
    const { translationAPIClient } = await import('./services/translationAPIClient.js');
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
