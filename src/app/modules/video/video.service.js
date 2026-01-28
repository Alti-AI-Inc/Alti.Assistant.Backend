import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { getOperationStatus } from './videoService.js';

const generateGuestUserId = () => new mongoose.Types.ObjectId().toString();

const generateVideoConversationId = () => {
  return `vid-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const handleVideoConversation = async (userId, conversationId, videoQuery, isGuest = false, req = null) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          isGuest ? null : userId
        );
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(`Guest user ${userId} tried to access non-guest conversation ${conversationId}`);
          conversation = null;
        }
      } catch (e) {
        logger.warn(`Conversation ${conversationId} not found; creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateVideoConversationId();
      const base = {
        userId,
        title: `Video: ${videoQuery.substring(0, 50)}...`,
        metadata: {
          category: 'video',
          model: 'video-assistant',
          videoType: 'generation',
          userType: isGuest ? 'guest' : 'authenticated',
          isGuest: !!isGuest,
        },
        is_video_assistant: true,
      };
      conversation = await conversationService.createConversation(base, newConversationId, req);
      logger.info(`Created video conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling video conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle video conversation');
  }
};

const addVideoQueryMessage = async (conversationId, userId, videoQuery, isGuest = false, req = null) => {
  try {
    const message = await conversationService.addMessageToConversation(conversationId, userId, {
      role: 'user',
      content: videoQuery,
      metadata: {
        messageType: 'video_query',
        timestamp: new Date().toISOString(),
      },
    });
    logger.info(`Added video query message to ${conversationId} for ${isGuest ? 'guest' : 'auth'} user ${userId}`);
    return message;
  } catch (error) {
    logger.error('Error adding video query message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add video query message');
  }
};

const addVideoResultMessage = async (conversationId, userId, content, metadata = {}, isGuest = false, req = null) => {
  try {
    const message = await conversationService.addMessageToConversation(conversationId, userId, {
      role: 'assistant',
      content: typeof content === 'string' ? content : JSON.stringify(content),
      metadata: {
        messageType: 'video_result',
        timestamp: new Date().toISOString(),
        model: 'video-assistant',
        ...metadata,
      },
    });
    logger.info(`Added video result message to ${conversationId} for ${isGuest ? 'guest' : 'auth'} user ${userId}`);
    return message;
  } catch (error) {
    logger.error('Error adding video result message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add video result message');
  }
};

const addErrorMessage = async (conversationId, userId, errorMessage, error, isGuest = false, req = null) => {
  try {
    return await conversationService.addMessageToConversation(conversationId, userId, {
      role: 'assistant',
      content: errorMessage,
      metadata: {
        messageType: 'error',
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      },
    });
  } catch (convError) {
    logger.error('Error adding error message to conversation:', convError);
    return null;
  }
};

const getGuestConversations = async (guestUserId, req = null) => {
  try {
    const conversations = await conversationHelpers.getUserConversations(guestUserId, {
      category: 'video',
      limit: 100,
    });
    return conversations.conversations.filter((c) => c.metadata?.userType === 'guest');
  } catch (error) {
    logger.error('Error getting guest video conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve guest conversations');
  }
};

const getGuestConversation = async (conversationId, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, req);
    if (conversation && conversation.metadata?.userType === 'guest') return conversation;
    throw new ApiError(httpStatus.NOT_FOUND, 'Guest conversation not found');
  } catch (error) {
    logger.error('Error fetching guest video conversation:', error);
    throw error;
  }
};

const getVideoStats = async (userId, req = null) => {
  try {
    const videoConversations = await conversationHelpers.getUserConversations(userId, {
      category: 'video',
      limit: 1000,
    });
    let totalMessages = 0;
    let totalVideos = 0;
    for (const conv of videoConversations.conversations) {
      totalMessages += conv.messageCount || 0;
      totalVideos += Math.floor((conv.messageCount || 0) / 2);
    }
    return {
      totalConversations: videoConversations.totalCount,
      totalMessages,
      totalVideos,
      averageMessagesPerConversation:
        videoConversations.totalCount > 0
          ? (totalMessages / videoConversations.totalCount).toFixed(2)
          : 0,
      lastActivity: videoConversations.conversations[0]?.lastActivity || null,
    };
  } catch (error) {
    logger.error('Error getting video stats:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve video statistics');
  }
};

export const videoService = {
  generateGuestUserId,
  getOperationStatus,
  generateVideoConversationId,
  handleVideoConversation,
  addVideoQueryMessage,
  addVideoResultMessage,
  addErrorMessage,
  getGuestConversations,
  getGuestConversation,
  getVideoStats,
};

