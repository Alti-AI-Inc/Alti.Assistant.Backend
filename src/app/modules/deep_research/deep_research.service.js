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
 * Generate unique conversation ID for deep research
 * @returns {string}
 */
const generateDeepResearchConversationId = () => {
  return `dr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create or get deep research conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} researchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const handleDeepResearchConversation = async (
  userId,
  conversationId,
  researchQuery,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation for both authenticated and guest users
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          isGuest ? null : userId,
          req
        );

        // For guest users, verify the conversation belongs to them or is a guest conversation
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null; // Force creation of new conversation
        }
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found for user ${userId}, creating new one`
        );
      }
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const newConversationId =
        conversationId || generateDeepResearchConversationId();

      if (isGuest) {
        // For guest users, create a conversation in the database but mark it as guest
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Deep Research: ${researchQuery.substring(0, 50)}...`,
            metadata: {
              category: 'deep_research',
              model: 'deep-research-agent',
              researchType: 'recursive_deep',
              userType: 'guest',
              isGuest: true,
            },
            is_deep_search: true,
          },
          newConversationId,
          req
        );
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Deep Research: ${researchQuery.substring(0, 50)}...`,
            metadata: {
              category: 'deep_research',
              model: 'deep-research-agent',
              researchType: 'recursive_deep',
              userType: 'authenticated',
            },
            is_deep_search: true,
          },
          newConversationId,
          req
        );
      }

      console.log(
        `Created new deep research conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling deep research conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle deep research conversation'
    );
  }
};

/**
 * Add deep research query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} researchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addDeepResearchQueryMessage = async (
  conversationId,
  userId,
  researchQuery,
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding deep research query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the message in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: researchQuery,
        metadata: {
          type: 'deep_research_query',
          timestamp: new Date().toISOString(),
        },
      },
      req
    );
  } catch (error) {
    logger.error('Error adding deep research query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add deep research query to conversation'
    );
  }
};

/**
 * Add deep research result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} researchResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addDeepResearchResultMessage = async (
  conversationId,
  userId,
  researchResult,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding deep research result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the result in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: researchResult,
        metadata: {
          type: 'deep_research_result',
          timestamp: new Date().toISOString(),
          model: 'deep-research-agent',
          ...metadata,
        },
      },
      req
    );
  } catch (error) {
    logger.error('Error adding deep research result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add deep research result to conversation'
    );
  }
};

/**
 * Add error message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} errorMessage
 * @param {Error} originalError
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addErrorMessage = async (
  conversationId,
  userId,
  errorMessage,
  originalError,
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding error message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

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
        },
      },
      req
    );
  } catch (error) {
    logger.error('Error adding error message:', error);
    // Don't throw here to avoid cascading errors
  }
};

/**
 * Process deep research history for context
 * @param {string} conversationId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getDeepResearchHistory = async (
  conversationId,
  userId,
  limit = 5,
  req = null
) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation || !conversation.messages) {
      return [];
    }

    // Get recent messages and format for deep research context
    return conversation.messages.slice(-limit).map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  } catch (error) {
    logger.error('Error getting deep research history:', error);
    return [];
  }
};

/**
 * Update conversation title based on research query
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} researchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const updateConversationTitle = async (
  conversationId,
  userId,
  researchQuery,
  isGuest = false,
  req = null
) => {
  try {
    if (isGuest) {
      // For guest users, just log the title update
      logger.info(
        `Guest user ${userId} conversation ${conversationId} title update: ${researchQuery.substring(0, 50)}...`
      );
      return { success: true, isGuest: true };
    }

    const newTitle = `Deep Research: ${researchQuery.substring(0, 50)}...`;
    return await conversationService.updateConversationTitle(
      conversationId,
      userId,
      newTitle,
      req
    );
  } catch (error) {
    logger.error('Error updating conversation title:', error);
    // Don't throw here as it's not critical
    return { success: false, error: error.message };
  }
};

/**
 * Get deep research statistics for the user
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getDeepResearchStats = async (userId, req = null) => {
  try {
    // Get all deep research conversations for the user
    const deepResearchConversations =
      await conversationHelpers.getUserConversations(
        userId,
        {
          limit: 1000, // Get all for stats
          category: 'deep_research',
        },
        req
      );

    const totalDeepResearches = deepResearchConversations.conversations.length;
    const totalMessages = deepResearchConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalDeepResearchConversations: totalDeepResearches,
      totalDeepResearchMessages: totalMessages,
      averageMessagesPerConversation:
        totalDeepResearches > 0
          ? Math.round(totalMessages / totalDeepResearches)
          : 0,
    };
  } catch (error) {
    logger.error('Error getting deep research stats:', error);
    return {
      totalDeepResearchConversations: 0,
      totalDeepResearchMessages: 0,
      averageMessagesPerConversation: 0,
    };
  }
};

export const deepResearchService = {
  handleDeepResearchConversation,
  addDeepResearchQueryMessage,
  addDeepResearchResultMessage,
  addErrorMessage,
  getDeepResearchHistory,
  updateConversationTitle,
  generateDeepResearchConversationId,
  generateGuestUserId,
  getDeepResearchStats,
};
