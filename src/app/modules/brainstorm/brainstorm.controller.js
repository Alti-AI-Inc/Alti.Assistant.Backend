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
  // Determine userId based on authentication status.
  // For authenticated users, userId must come from req.user to prevent IDOR.
  // For guests, a unique ID is generated.
  let userId = isGuest
    ? brainstormService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  // BUG/SECURITY VULNERABILITY: Allowing userId to be overridden from req.body is an IDOR vulnerability.
  // An attacker could pass another user's ID to perform actions on their behalf.
  // The userId should be strictly derived from the authenticated session or generated for guests.
  // userId = req.body.userId || userId; // REMOVED

  logger.info(
    `Brainstorm assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    { conversationId }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });

    // BUG: The original logic `promptUsage <= totalConversationWithConvId` was flawed.
    // `userSubscription.usage` is assumed to be the remaining prompts, consistent with `generateBrainstorm`.
    // `totalConversationWithConvId` was incorrectly derived from `getConversationById` (a single conversation object)
    // and used in a comparison that didn't make sense for a monthly limit.
    // The correct check for a monthly limit based on remaining usage is to ensure `userSubscription` exists
    // and `userSubscription.usage` is greater than 0.
    if (!userSubscription || userSubscription.usage <= 0) {
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

  // This check is still valid, as userId might be null if req.user was malformed
  // and generateGuestUserId somehow failed (though unlikely).
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
  // Determine userId based on authentication status.
  // For authenticated users, userId must come from req.user to prevent IDOR.
  // For guests, a unique ID is generated.
  let userId = isGuest
    ? brainstormService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  // BUG/SECURITY VULNERABILITY: Allowing userId to be overridden from req.body is an IDOR vulnerability.
  // An attacker could pass another user's ID to perform actions on their behalf.
  // The userId should be strictly derived from the authenticated session or generated for guests.
  // userId = req.body.userId || userId; // REMOVED

  logger.info(
    `Structured brainstorm request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });

    // BUG: The original logic `if (userSubscription && userSubscription.usage <= 0)`
    // would allow users without any subscription to bypass the limit check.
    // The correct check is to ensure `userSubscription` exists AND `userSubscription.usage` is greater than 0.
    // This aligns with the fix in `conversationalAssistant`.
    if (!userSubscription || userSubscription.usage <= 0) {
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
    const result = await brainstormService.generateStructuredBrainstorm(
      userId,
      req.body,
      req
    );

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
  const userId = req.user?.userId || req.user?._id; // Correctly derived from req.user

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    const result = await brainstormService.getConversationHistory(
      conversationId,
      userId, // userId passed for authorization check in service layer
      req
    );

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
  const {
    conversationId,
    format = 'markdown',
    includeHistory = true,
  } = req.body;
  const userId = req.user?.userId || req.user?._id; // Correctly derived from req.user

  logger.info(`Exporting brainstorm session ${conversationId} as ${format}`);

  try {
    const result = await brainstormService.exportBrainstormSession(
      conversationId,
      userId, // userId passed for authorization check in service layer
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
  const userId = req.user?.userId || req.user?._id; // Correctly derived from req.user

  logger.info(`Refining brainstorm in conversation ${conversationId}`);

  try {
    const result = await brainstormService.refineBrainstorm(
      conversationId,
      userId, // userId passed for authorization check in service layer
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