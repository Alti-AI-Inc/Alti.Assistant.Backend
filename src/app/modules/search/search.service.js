import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Create or get search conversation
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} searchQuery
 * @returns {Promise<Object>}
 */
const handleSearchConversation = async (userId, conversationId, searchQuery) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId);
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found for user ${userId}, creating new one`);
      }
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const newConversationId = conversationId || generateSearchConversationId();
      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Search: ${searchQuery.substring(0, 50)}...`,
          metadata: {
            category: 'search',
            model: 'research-agent',
            searchType: 'assistant',
          },
          is_deep_search: true,
        },
        newConversationId
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling search conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle search conversation');
  }
};

/**
 * Add search query message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} searchQuery
 * @returns {Promise<Object>}
 */
const addSearchQueryMessage = async (conversationId, userId, searchQuery) => {
  try {
    return await conversationService.addMessageToConversation(
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
  } catch (error) {
    logger.error('Error adding search query message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add search query to conversation');
  }
};

/**
 * Add search result message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} searchResult
 * @param {Object} metadata
 * @returns {Promise<Object>}
 */
const addSearchResultMessage = async (conversationId, userId, searchResult, metadata = {}) => {
  try {
    return await conversationService.addMessageToConversation(
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
  } catch (error) {
    logger.error('Error adding search result message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add search result to conversation');
  }
};

/**
 * Add error message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} errorMessage
 * @param {Error} originalError
 * @returns {Promise<Object>}
 */
const addErrorMessage = async (conversationId, userId, errorMessage, originalError) => {
  try {
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
  getSearchStats,
};
