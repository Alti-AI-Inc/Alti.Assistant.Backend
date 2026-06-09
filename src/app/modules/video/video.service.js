/**
 * @file This service module handles operations related to video conversations,
 * including creating, managing, and retrieving video-specific conversation data.
 * It integrates with the core conversation service to store and retrieve messages
 * and conversation metadata.
 */

import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { getOperationStatus } from './videoService.js';

/**
 * Generates a unique ID for a guest user.
 * This ID is a standard MongoDB ObjectId converted to a string.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => new mongoose.Types.ObjectId().toString();

/**
 * Generates a unique conversation ID specifically for video-related conversations.
 * The ID is prefixed with 'vid-conv-' and includes a timestamp and a random string.
 * @returns {string} A unique string representing a video conversation ID.
 */
const generateVideoConversationId = () => {
  return `vid-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of a video conversation.
 * If a `conversationId` is provided, it attempts to retrieve it. If not found
 * or if a guest user tries to access a non-guest conversation, a new conversation is created.
 *
 * @param {string} userId - The ID of the user (authenticated or guest).
 * @param {string | null} conversationId - The ID of an existing conversation, or null to create a new one.
 * @param {string} videoQuery - The initial video query that will be used as the conversation title.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} A promise that resolves to the conversation object.
 * @throws {ApiError} If there is an internal server error handling the video conversation.
 */
const handleVideoConversation = async (
  userId,
  conversationId,
  videoQuery,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          isGuest ? null : userId
        );
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} tried to access non-guest conversation ${conversationId}`
          );
          conversation = null; // Treat as not found for guest access violation
        }
      } catch (e) {
        logger.warn(
          `Conversation ${conversationId} not found; creating new one`
        );
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
      conversation = await conversationService.createConversation(
        base,
        newConversationId,
        req
      );
      logger.info(
        `Created video conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling video conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle video conversation'
    );
  }
};

/**
 * Adds a user's video query message to a specified conversation.
 * The message is stored with a 'user' role and 'video_query' messageType metadata.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user sending the message.
 * @param {string} videoQuery - The content of the video query message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<object>} A promise that resolves to the created message object.
 * @throws {ApiError} If there is an internal server error adding the message.
 */
const addVideoQueryMessage = async (
  conversationId,
  userId,
  videoQuery,
  isGuest = false,
  req = null
) => {
  try {
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: videoQuery,
        metadata: {
          messageType: 'video_query',
          timestamp: new Date().toISOString(),
        },
      }
    );
    logger.info(
      `Added video query message to ${conversationId} for ${isGuest ? 'guest' : 'auth'} user ${userId}`
    );
    return message;
  } catch (error) {
    logger.error('Error adding video query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add video query message'
    );
  }
};

/**
 * Adds an assistant's video result message to a specified conversation.
 * The message is stored with an 'assistant' role and 'video_result' messageType metadata.
 * Content can be a string or an object, which will be stringified.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string | object} content - The content of the video result message.
 * @param {object} [metadata={}] - Additional metadata to include with the message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<object>} A promise that resolves to the created message object.
 * @throws {ApiError} If there is an internal server error adding the message.
 */
const addVideoResultMessage = async (
  conversationId,
  userId,
  content,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content:
          typeof content === 'string' ? content : JSON.stringify(content),
        metadata: {
          messageType: 'video_result',
          timestamp: new Date().toISOString(),
          model: 'video-assistant',
          ...metadata,
        },
      }
    );
    logger.info(
      `Added video result message to ${conversationId} for ${isGuest ? 'guest' : 'auth'} user ${userId}`
    );
    return message;
  } catch (error) {
    logger.error('Error adding video result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add video result message'
    );
  }
};

/**
 * Adds an error message from the assistant to a specified conversation.
 * This is used to log and display errors encountered during video processing.
 *
 * @param {string} conversationId - The ID of the conversation to add the error message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} errorMessage - The user-friendly error message content.
 * @param {Error} error - The actual error object for logging and detailed metadata.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<object | null>} A promise that resolves to the created message object, or null if adding the error message itself fails.
 */
const addErrorMessage = async (
  conversationId,
  userId,
  errorMessage,
  error,
  isGuest = false,
  req = null
) => {
  try {
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: errorMessage,
        metadata: {
          messageType: 'error',
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            stack:
              process.env.NODE_ENV === 'development' ? error.stack : undefined,
          },
        },
      }
    );
  } catch (convError) {
    logger.error('Error adding error message to conversation:', convError);
    return null;
  }
};

/**
 * Retrieves a list of video conversations associated with a guest user.
 * It filters conversations to ensure only those marked as 'guest' are returned.
 *
 * @param {string} guestUserId - The ID of the guest user.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of guest video conversation objects.
 * @throws {ApiError} If there is an internal server error retrieving guest conversations.
 */
const getGuestConversations = async (guestUserId, req = null) => {
  try {
    const conversations = await conversationHelpers.getUserConversations(
      guestUserId,
      {
        category: 'video',
        limit: 100, // Limit to 100 guest video conversations
      }
    );
    return conversations.conversations.filter(
      (c) => c.metadata?.userType === 'guest'
    );
  } catch (error) {
    logger.error('Error getting guest video conversations:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve guest conversations'
    );
  }
};

/**
 * Retrieves a single guest video conversation by its ID.
 * It ensures that the retrieved conversation is indeed marked as a 'guest' conversation.
 *
 * @param {string} conversationId - The ID of the guest conversation to retrieve.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<object>} A promise that resolves to the guest conversation object.
 * @throws {ApiError} If the conversation is not found or is not a guest conversation, or if an internal server error occurs.
 */
const getGuestConversation = async (conversationId, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      req
    );
    if (conversation && conversation.metadata?.userType === 'guest')
      return conversation;
    throw new ApiError(httpStatus.NOT_FOUND, 'Guest conversation not found');
  } catch (error) {
    logger.error('Error fetching guest video conversation:', error);
    throw error; // Re-throw specific ApiError or wrap other errors
  }
};

/**
 * Retrieves statistics related to a user's video conversations.
 * This includes total conversations, messages, estimated videos generated,
 * average messages per conversation, and the last activity timestamp.
 *
 * @param {string} userId - The ID of the user for whom to retrieve video statistics.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<object>} A promise that resolves to an object containing video statistics.
 * @property {number} totalConversations - The total number of video conversations.
 * @property {number} totalMessages - The total number of messages across all video conversations.
 * @property {number} totalVideos - An estimate of the total number of videos generated (based on message count).
 * @property {string | number} averageMessagesPerConversation - The average number of messages per video conversation, formatted to two decimal places.
 * @property {string | null} lastActivity - The timestamp of the last activity in any video conversation, or null if no conversations.
 * @throws {ApiError} If there is an internal server error retrieving video statistics.
 */
const getVideoStats = async (userId, req = null) => {
  try {
    const videoConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        category: 'video',
        limit: 1000, // Fetch a reasonable number to calculate stats
      }
    );
    let totalMessages = 0;
    let totalVideos = 0;
    for (const conv of videoConversations.conversations) {
      totalMessages += conv.messageCount || 0;
      // Assuming roughly 2 messages per video (query + result)
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve video statistics'
    );
  }
};

/**
 * @namespace videoService
 * @description Provides a collection of functions for managing video-related conversations
 * and their messages within the application. This service acts as an interface
 * for creating, updating, and retrieving video conversation data, integrating
 * with the core conversation management system.
 */
export const videoService = {
  generateGuestUserId,
  getOperationStatus, // Assuming this is imported from './videoService.js' and is part of the public API
  generateVideoConversationId,
  handleVideoConversation,
  addVideoQueryMessage,
  addVideoResultMessage,
  addErrorMessage,
  getGuestConversations,
  getGuestConversation,
  getVideoStats,
};