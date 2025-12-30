import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentAnalysisService } from './document_analysis.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { RESPONSE_MESSAGES } from './document_analysis.constant.js';

/**
 * Analyze document or text endpoint
 * Handles both file upload and text analysis with optional conversation context
 */
export const analyzeDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? documentAnalysisService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, analysisType, outputFormat } = req.body;
  userId = req.body.userId || userId;

  // Handle file upload if present
  const fileInfo = req.file
    ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      location: req.file.location || req.file.path,
    }
    : null;

  logger.info(
    `Document analysis request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      hasMessage: !!message,
      conversationId,
      analysisType,
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
        message: 'Usage limit exceeded. Please upgrade your subscription.',
      });
    }
  }

  // Perform analysis
  const result = await documentAnalysisService.analyzeContent(
    userId,
    message,
    fileInfo,
    conversationId,
    analysisType,
    outputFormat,
    isGuest
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: RESPONSE_MESSAGES.SUCCESS,
    data: result,
  });
});

/**
 * Get conversation history endpoint
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history: ${conversationId} for user ${userId}`);

  const conversation = await documentAnalysisService.getConversationHistory(conversationId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation history retrieved successfully',
    data: conversation,
  });
});

export const documentAnalysisController = {
  analyzeDocument,
  getConversationHistory,
};
