import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { openMemoryClient } from '../../shared/openMemoryClient.js';

/**
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Create or get search conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} searchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const handleSearchConversation = async (userId, conversationId, searchQuery, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation for both authenticated and guest users
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);

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
      const newConversationId = conversationId || generateSearchConversationId();

      if (isGuest) {
        // For guest users, create a conversation in the database but mark it as guest
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Search: ${searchQuery.substring(0, 50)}...`,
            metadata: {
              category: 'search',
              model: 'research-agent',
              searchType: 'assistant',
              userType: 'guest',
              isGuest: true,
            },
            is_deep_search: true,
          },
          newConversationId
        );
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Search: ${searchQuery.substring(0, 50)}...`,
            metadata: {
              category: 'search',
              model: 'research-agent',
              searchType: 'assistant',
              userType: 'authenticated',
            },
            is_deep_search: true,
          },
          newConversationId
        );
      }

      console.log(`Created new conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling search conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle search conversation');
  }
};

/**
 * Add search query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} searchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addSearchQueryMessage = async (conversationId, userId, searchQuery, isGuest = false) => {
  try {
    console.log(`Adding search query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    // Store the message in the conversation for both guest and authenticated users
    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: searchQuery,
        metadata: {
          type: 'search_query',
          timestamp: new Date().toISOString(),
        },
      }
    );

    if (openMemoryClient?.enabled && searchQuery && userId) {
      try {
        await openMemoryClient.addMemory({
          content: searchQuery,
          userId,
          tags: ['search', 'query'],
          metadata: {
            conversationId,
            type: 'search_query',
            timestamp: new Date().toISOString(),
            isGuest,
          },
          sector: 'episodic',
        });
      } catch (memoryError) {
        logger.warn('Failed to persist search query in OpenMemory', memoryError);
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding search query message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add search query to conversation');
  }
};

/**
 * Add search result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} searchResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addSearchResultMessage = async (conversationId, userId, searchResult, metadata = {}, isGuest = false) => {
  try {
    console.log(`Adding search result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    // Store the result in the conversation for both guest and authenticated users
    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: searchResult,
        metadata: {
          type: 'search_result',
          timestamp: new Date().toISOString(),
          model: 'research-agent',
          ...metadata,
        },
      }
    );

    if (openMemoryClient?.enabled && searchResult && userId) {
      try {
        await openMemoryClient.addMemory({
          content: searchResult,
          userId,
          tags: ['search', 'answer'],
          metadata: {
            conversationId,
            ...metadata,
            type: metadata?.type || 'search_result',
            isGuest,
          },
          sector: metadata?.sector || 'semantic',
        });
      } catch (memoryError) {
        logger.warn('Failed to persist search result in OpenMemory', memoryError);
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding search result message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add search result to conversation');
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
const addErrorMessage = async (conversationId, userId, errorMessage, originalError, isGuest = false) => {
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
        },
      }
    );
  } catch (error) {
    logger.error('Error adding error message:', error);
    // Don't throw here to avoid cascading errors
  }
};

/**
 * Process search history for context
 * @param {string} conversationId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getSearchHistory = async (conversationId, userId, limit = 10) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    if (!conversation || !conversation.messages) {
      return [];
    }

    // Get recent messages and format for search context
    return conversation.messages
      .slice(-limit)
      .map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));
  } catch (error) {
    logger.error('Error getting search history:', error);
    return [];
  }
};

/**
 * Update conversation title based on search query
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} searchQuery
 * @returns {Promise<void>}
 */
const updateConversationTitle = async (conversationId, userId, searchQuery) => {
  try {
    const title = `Search: ${searchQuery.substring(0, 50)}${searchQuery.length > 50 ? '...' : ''}`;
    await conversationService.updateConversationTitle(conversationId, userId, title);
  } catch (error) {
    logger.warn('Failed to update conversation title:', error);
    // Don't throw as this is not critical
  }
};

/**
 * Generate unique conversation ID for search
 * @returns {string}
 */
const generateSearchConversationId = () => {
  return `search-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get search conversation statistics
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getSearchStats = async (userId) => {
  try {
    const searchConversations = await conversationHelpers.getUserConversations(userId, {
      page: 1,
      limit: 1000, // Get all for stats
      category: 'search',
    });

    const totalSearches = searchConversations.conversations.length;
    const totalMessages = searchConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalSearchConversations: totalSearches,
      totalSearchMessages: totalMessages,
      averageMessagesPerConversation: totalSearches > 0 ? Math.round(totalMessages / totalSearches) : 0,
    };
  } catch (error) {
    logger.error('Error getting search stats:', error);
    return {
      totalSearchConversations: 0,
      totalSearchMessages: 0,
      averageMessagesPerConversation: 0,
    };
  }
};

export const searchService = {
  handleSearchConversation,
  addSearchQueryMessage,
  addSearchResultMessage,
  addErrorMessage,
  getSearchHistory,
  updateConversationTitle,
  generateSearchConversationId,
  generateGuestUserId,
  getSearchStats,
};
