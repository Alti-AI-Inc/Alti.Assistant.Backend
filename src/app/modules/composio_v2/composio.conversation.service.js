import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';

/**
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique conversation ID for composio interactions
 * @returns {string}
 */
const generateComposioConversationId = () => {
  return `composio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create or get composio conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} userInput
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const handleComposioConversation = async (userId, conversationId, userInput, isGuest = false, req = null) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation for both authenticated and guest users
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId, req);

        // For guest users, verify the conversation belongs to them or is a guest conversation
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(`Guest user ${userId} trying to access non-guest conversation ${conversationId}`);
          conversation = null; // Force creation of new conversation
        }

      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found for user ${userId}, creating new one`);
      }
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const newConversationId = conversationId || generateComposioConversationId();

      // Generate a meaningful title from the user input
      const title = `Automation task: ${userInput.substring(0, 50)}${userInput.length > 50 ? '...' : ''}`;

      if (isGuest) {
        // For guest users, create a conversation in the database but mark it as guest
        conversation = await conversationService.createConversation(
          {
            userId,
            title,
            metadata: {
              category: 'composio',
              model: 'ai-classification-agent',
              toolType: 'multi-app',
              userType: 'guest',
              isGuest: true,
            },
            is_deep_search: false,
          },
          newConversationId
        );
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title,
            metadata: {
              category: 'composio',
              model: 'ai-classification-agent',
              toolType: 'multi-app',
              userType: 'authenticated',
            },
            is_deep_search: false,
          },
          newConversationId
        );
      }

      console.log(`Created new composio conversation with title ${title} ${newConversationId} for user ${userId} (guest: ${isGuest})`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling composio conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle composio conversation');
  }
};

/**
 * Add user input message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} userInput
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addComposioQueryMessage = async (conversationId, userId, userInput, isGuest = false, req = null) => {
  try {
    console.log(`Adding composio query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    // Store the message in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: userInput,
        metadata: {
          type: 'composio_query',
          timestamp: new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    logger.error('Error adding composio query message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add composio query to conversation');
  }
};

/**
 * Add composio result message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} result
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addComposioResultMessage = async (conversationId, userId, result, metadata = {}, isGuest = false, req = null) => {
  try {
    console.log(`Adding composio result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    // Store the result in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: result,
        metadata: {
          type: 'composio_result',
          timestamp: new Date().toISOString(),
          model: 'ai-classification-agent',
          ...metadata,
        },
      }
    );
  } catch (error) {
    logger.error('Error adding composio result message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add composio result to conversation');
  }
};

/**
 * Add error message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} errorMessage
 * @param {Error} originalError
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addComposioErrorMessage = async (conversationId, userId, errorMessage, originalError, isGuest = false, req = null) => {
  try {
    console.log(`Adding error message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    // Store the error in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: errorMessage,
        metadata: {
          type: 'error',
          timestamp: new Date().toISOString(),
          error: originalError?.message || 'Unknown error',
          category: 'composio',
        },
      }
    );
  } catch (error) {
    logger.error('Error adding error message:', error);
    // Don't throw here to avoid cascading errors
  }
};

/**
 * Get composio conversation history for context
 * @param {string} conversationId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getComposioHistory = async (conversationId, userId, limit = 10, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

    if (!conversation) {
      return [];
    }

    // Get last N messages for context
    const recentMessages = conversation.messages
      .slice(-limit)
      .map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: msg.metadata
      }));

    return recentMessages;
  } catch (error) {
    logger.error('Error getting composio history:', error);
    return [];
  }
};

/**
 * Update conversation title based on workflow results
 * @param {string} conversationId
 * @param {string} userId
 * @param {Object} workflowResult
 * @returns {Promise<void>}
 */
const updateComposioConversationTitle = async (conversationId, userId, workflowResult, req = null) => {
  try {
    const { identifiedApp, identifiedAction, workflowType } = workflowResult;

    let newTitle = 'Tool Execution';

    if (identifiedApp && identifiedAction) {
      newTitle = `${identifiedAction}`;
    } else if (workflowType === 'multi_step') {
      newTitle = `Multi-step Workflow`;
    }

    await conversationService.updateConversationTitle(conversationId, userId, newTitle, req);

    logger.info(`Updated conversation title for ${conversationId}: ${newTitle}`);
  } catch (error) {
    logger.error('Error updating conversation title:', error);
    // Don't throw to avoid disrupting the main flow
  }
};

/**
 * Get composio conversation stats for a user
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getComposioStats = async (userId, req = null) => {
  try {
    const composioConversations = await conversationHelpers.getUserConversations(
      userId,
      { 'metadata.category': 'composio' },
      { limit: 1000 }
    );

    const totalComposio = composioConversations.conversations.length;
    const totalMessages = composioConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalComposioConversations: totalComposio,
      totalComposioMessages: totalMessages,
      averageMessagesPerConversation: totalComposio > 0 ? Math.round(totalMessages / totalComposio) : 0,
    };
  } catch (error) {
    logger.error('Error getting composio stats:', error);
    return {
      totalComposioConversations: 0,
      totalComposioMessages: 0,
      averageMessagesPerConversation: 0,
    };
  }
};

export const composioConversationService = {
  handleComposioConversation,
  addComposioQueryMessage,
  addComposioResultMessage,
  addComposioErrorMessage,
  getComposioHistory,
  updateComposioConversationTitle,
  generateComposioConversationId,
  generateGuestUserId,
  getComposioStats,
};
