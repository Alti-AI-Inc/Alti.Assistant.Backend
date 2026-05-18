/**
 * Code Assistant Service Module
 *
 * This service handles all code-related operations including:
 * - Managing code conversations and chat history
 * - Integration with the conversation system for persistent storage
 * - Code query processing and result handling
 * - User statistics and usage tracking
 * - Error handling and recovery
 *
 * Structure follows the same pattern as the search module for consistency.
 *
 * @module CodeService
 */

import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';

/**
 * Create or get code conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} codeQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const handleCodeConversation = async (
  userId,
  conversationId,
  codeQuery,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId && !isGuest) {
      // Try to get existing conversation for authenticated users only
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        );
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found for user ${userId}, creating new one`
        );
      }
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const newConversationId = conversationId || generateCodeConversationId();

      if (isGuest) {
        // For guest users, create a simpler conversation structure
        conversation = {
          conversationId: newConversationId,
          userId: userId,
          title: `Code: ${codeQuery.substring(0, 50)}...`,
          messageCount: 0,
          isGuest: true,
          metadata: {
            category: 'code',
            model: 'code-assistant',
            codeType: 'assistant',
            userType: 'guest',
          },
          createdAt: new Date(),
        };
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Code: ${codeQuery.substring(0, 50)}...`,
            metadata: {
              category: 'code',
              model: 'code-assistant',
              codeType: 'assistant',
              userType: 'authenticated',
            },
            is_code_assistant: true,
          },
          newConversationId,
          req
        );
      }
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling code conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle code conversation'
    );
  }
};

/**
 * Add code query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} codeQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addCodeQueryMessage = async (
  conversationId,
  userId,
  codeQuery,
  isGuest = false,
  req = null
) => {
  try {
    if (isGuest) {
      // For guest users, just log the message (don't store in database)
      logger.info(
        `Guest user ${userId} code query in conversation ${conversationId}: ${codeQuery.substring(0, 100)}...`
      );
      return {
        success: true,
        message: 'Guest message logged',
        conversationId,
        userId,
        isGuest: true,
      };
    }

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: codeQuery,
        metadata: {
          type: 'code_query',
          timestamp: new Date().toISOString(),
        },
      },
      req
    );
  } catch (error) {
    logger.error('Error adding code query message:', error);
    if (isGuest) {
      // Don't throw for guest users
      return { success: false, error: error.message, isGuest: true };
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add code query to conversation'
    );
  }
};

/**
 * Add code result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} codeResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addCodeResultMessage = async (
  conversationId,
  userId,
  codeResult,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    if (isGuest) {
      // For guest users, just log the response (don't store in database)
      logger.info(
        `Guest user ${userId} code result in conversation ${conversationId}: ${codeResult.substring(0, 100)}...`
      );
      return {
        success: true,
        message: 'Guest response logged',
        conversationId,
        userId,
        isGuest: true,
      };
    }

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: codeResult,
        metadata: {
          type: 'code_result',
          timestamp: new Date().toISOString(),
          model: 'code-assistant',
          ...metadata,
        },
      },
      req
    );
  } catch (error) {
    logger.error('Error adding code result message:', error);
    if (isGuest) {
      // Don't throw for guest users
      return { success: false, error: error.message, isGuest: true };
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add code result to conversation'
    );
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
const addErrorMessage = async (
  conversationId,
  userId,
  errorMessage,
  originalError,
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
 * Process code history for context
 * @param {string} conversationId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getCodeHistory = async (
  conversationId,
  userId,
  limit = 10,
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

    // Get recent messages and format for code context
    return conversation.messages.slice(-limit).map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  } catch (error) {
    logger.error('Error getting code history:', error);
    return [];
  }
};

/**
 * Update conversation title based on code query
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} codeQuery
 * @returns {Promise<void>}
 */
const updateConversationTitle = async (
  conversationId,
  userId,
  codeQuery,
  req = null
) => {
  try {
    const title = `Code: ${codeQuery.substring(0, 50)}${codeQuery.length > 50 ? '...' : ''}`;
    await conversationService.updateConversationTitle(
      conversationId,
      userId,
      title,
      req
    );
  } catch (error) {
    logger.warn('Failed to update conversation title:', error);
    // Don't throw as this is not critical
  }
};

/**
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate unique conversation ID for code
 * @returns {string}
 */
const generateCodeConversationId = () => {
  return `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get code conversation statistics
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getCodeStats = async (userId, req = null) => {
  try {
    const codeConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        page: 1,
        limit: 1000, // Get all for stats
        category: 'code',
      },
      req
    );

    const totalCodeSessions = codeConversations.conversations.length;
    const totalMessages = codeConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalCodeConversations: totalCodeSessions,
      totalCodeMessages: totalMessages,
      averageMessagesPerConversation:
        totalCodeSessions > 0
          ? Math.round(totalMessages / totalCodeSessions)
          : 0,
    };
  } catch (error) {
    logger.error('Error getting code stats:', error);
    return {
      totalCodeConversations: 0,
      totalCodeMessages: 0,
      averageMessagesPerConversation: 0,
    };
  }
};

export const codeService = {
  handleCodeConversation,
  addCodeQueryMessage,
  addCodeResultMessage,
  addErrorMessage,
  getCodeHistory,
  updateConversationTitle,
  generateCodeConversationId,
  generateGuestUserId,
  getCodeStats,
};
