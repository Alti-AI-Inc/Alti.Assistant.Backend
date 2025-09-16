import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { videoService } from './video.service.js';
import { videoApp } from "./video_assistant/workflow.js";
import { videoHelpers } from './video.helper.js';

// Generate video similar to image module flow
export const generateVideo = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? videoService.generateGuestUserId() : (req.user?.userId || req.user?._id);
  userId = req.body?.userId || userId;

  const { message, conversationId } = req.body;

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A video prompt is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  // Subscription check only for authenticated users
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
          'You have reached your video generation limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  const thread_id = conversationId || videoService.generateVideoConversationId();

  try {
    const conversation = await videoService.handleVideoConversation(
      userId,
      conversationId,
      message,
      isGuest
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    await videoService.addVideoQueryMessage(actualConversationId, userId, message, isGuest);

    // Determine if this is the first message or a subsequent message
    const isFirstMessage = conversation.messageCount === 0 || !conversationId;

    logger.info(`Video generation for conversation ${actualConversationId}: isFirstMessage=${isFirstMessage}, messageCount=${conversation.messageCount}`);

    let inputs;
    if (isFirstMessage) {
      // For first message, use initialPrompt
      inputs = {
        initialPrompt: message,
      };
    } else {
      // For subsequent messages, use userResponse
      inputs = {
        userResponse: message
      };
    }

    const result = await videoApp.invoke(inputs, { configurable: { thread_id: actualConversationId } });
    logger.info(`Video Assistant Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`);

    let fullResponse = "";
    let videoData = null;

    // Handle different response types from the video assistant
    if (result.videoUrl) {
      // If video was generated
      fullResponse = result.response || "Video generated successfully";
      videoData = result.videoUrl;
    } else if (result.responseMessage) {
      // If it's a clarification or question
      fullResponse = result.responseMessage;
    } else {
      // Fallback
      fullResponse = "I'm processing your video request. Could you provide more details?";
    }

    // Add assistant response to conversation
    await videoService.addVideoResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      {
        video: videoData,
        preferences: inputs.preferences
      },
      isGuest
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Video generation completed successfully',
      data: {
        ...videoHelpers.formatVideoResponse(
          fullResponse,
          videoData,
          actualConversationId,
          conversation.messageCount + 2
        ),
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Video Assistant Error:', error);

    // Try to save error message to conversation if possible
    const errorConversationId = conversationId || videoService.generateVideoConversationId();
    try {
      if (errorConversationId && userId) {
        await videoService.addErrorMessage(
          errorConversationId,
          userId,
          videoHelpers.formatErrorMessage(error, message),
          error,
          isGuest
        );
      }
    } catch {
      // Ignore errors from logging the error message
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while processing your video request',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

const getVideoStats = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Statistics are only available for authenticated users',
    });
  }
  const userId = req.user?.userId || req.user?._id;
  const stats = await videoService.getVideoStats(userId);
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Video statistics retrieved successfully',
    data: stats,
  });
});

const getVideoConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest ? null : (req.user?.userId || req.user?._id);

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    let conversation;
    if (isGuest) {
      conversation = await videoService.getGuestConversation(conversationId);
    } else {
      conversation = await conversationHelpers.getConversationById(conversationId, userId);
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: { conversation, userType: isGuest ? 'guest' : 'authenticated' },
    });
  } catch (error) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Conversation not found',
    });
  }
});

const getGuestConversations = catchAsync(async (req, res) => {
  const { guestUserId } = req.params;
  if (!guestUserId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Guest user ID is required',
    });
  }
  const conversations = await videoService.getGuestConversations(guestUserId);
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Guest conversations retrieved successfully',
    data: {
      conversations,
      totalCount: conversations.length,
      userType: 'guest',
      userId: guestUserId,
    },
  });
});

const getOperationStatus = catchAsync(async (req, res) => {
  const { operationId } = req.body;
  if (!operationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Operation ID is required',
    });
  }

  try {
    const status = await videoService.getOperationStatus(operationId);
    if (!status) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Operation not found',
      });
    }
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Operation status retrieved successfully',
      data: status,
    });
  } catch (error) {
    logger.error('Error fetching operation status:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve operation status',
    });
  }
});

export const videoController = {
  generateVideo,
  getVideoStats,
  getVideoConversation,
  getOperationStatus,
  getGuestConversations,
};
