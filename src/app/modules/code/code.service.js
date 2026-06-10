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

// Optimization Recommendation:
// For the underlying Conversation Mongoose model (used by conversationHelpers and conversationService),
// consider adding indexes for improved query performance:
// 1. `userId`: For efficient lookup of conversations by user.
// 2. `category`: For filtering conversations by category (e.g., 'code').
// 3. Compound index `userId` and `category`: For queries that filter by both user and category.
// Example: ConversationSchema.index({ userId: 1 });
// Example: ConversationSchema.index({ category: 1 });
// Example: ConversationSchema.index({ userId: 1, category: 1 });

/**
 * Creates a new code conversation or retrieves an existing one.
 * This function supports both authenticated users and guest users,
 * handling the creation and retrieval logic based on the `isGuest` flag.
 * For authenticated users, it attempts to retrieve an existing conversation
 * by `conversationId` before creating a new one.
 * For guest users, it creates a simplified conversation object in memory
 * if no `conversationId` is provided, or uses the provided one.
 *
 * @function handleCodeConversation
 * @param {string} userId - The ID of the user initiating or continuing the conversation.
 * @param {string} [conversationId] - The ID of an existing conversation to retrieve. If not provided, a new one is generated.
 * @param {string} codeQuery - The initial code query that will be used to title a new conversation.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest. Guest conversations are not persisted in the database.
 * @param {object} [req=null] - The Express request object, used for tenant context in multi-tenant environments.
 * @returns {Promise<object>} A promise that resolves to the conversation object (either newly created or retrieved).
 * @throws {ApiError} If there's an internal server error during conversation handling.
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
        // Optimization: Use .lean() for read-only operations to improve performance.
        // Assumes conversationHelpers.getConversationById can accept a lean option.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req,
          { lean: true }
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
 * Adds a user's code query message to a conversation.
 * For authenticated users, the message is persisted in the database via `conversationService`.
 * For guest users, the message is only logged and not stored persistently.
 *
 * @function addCodeQueryMessage
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user sending the message.
 * @param {string} codeQuery - The content of the user's code query.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {object} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the result of adding the message.
 *   For guest users, returns a success object indicating the message was logged.
 * @throws {ApiError} If there's an internal server error when adding the message for an authenticated user.
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
 * Adds an assistant's code result message to a conversation.
 * For authenticated users, the message is persisted in the database via `conversationService`.
 * For guest users, the message is only logged and not stored persistently.
 *
 * @function addCodeResultMessage
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} codeResult - The content of the assistant's code result.
 * @param {object} [metadata={}] - Additional metadata to store with the message.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {object} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the result of adding the message.
 *   For guest users, returns a success object indicating the message was logged.
 * @throws {ApiError} If there's an internal server error when adding the message for an authenticated user.
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
 * Adds an error message from the assistant to a conversation.
 * This function is typically used to log system errors or issues encountered
 * during code processing within the conversation history. It prevents cascading
 * errors by not throwing an exception if adding the error message fails.
 *
 * @function addErrorMessage
 * @param {string} conversationId - The ID of the conversation to add the error message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} errorMessage - The user-friendly error message to display.
 * @param {Error} originalError - The original error object for logging and detailed metadata.
 * @param {object} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object|void>} A promise that resolves to the result of adding the message, or void if an error occurs during this operation.
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
 * Retrieves a limited history of messages for a specific code conversation.
 * This function is used to provide context for subsequent code queries.
 * It fetches the conversation by ID and returns the most recent messages,
 * formatted for use as conversational context.
 *
 * @function getCodeHistory
 * @param {string} conversationId - The ID of the conversation to retrieve history from.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {number} [limit=10] - The maximum number of recent messages to retrieve.
 * @param {object} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of message objects,
 *   each containing `role`, `content`, and `timestamp`. Returns an empty array if the
 *   conversation is not found or an error occurs.
 */
const getCodeHistory = async (
  conversationId,
  userId,
  limit = 10,
  req = null
) => {
  try {
    // Optimization: Use .lean() for read-only operations to improve performance.
    // Assumes conversationHelpers.getConversationById can accept a lean option.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      { lean: true }
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
 * Updates the title of a specific conversation based on a new code query.
 * This function is typically called after the initial query to provide a more
 * descriptive title for the conversation in the user interface.
 * It logs a warning but does not throw an error if the update fails, as it's
 * considered a non-critical operation.
 *
 * @function updateConversationTitle
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {string} codeQuery - The code query to use for generating the new title.
 * @param {object} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<void>} A promise that resolves once the title update attempt is complete.
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
 * Generates a unique ID for a guest user.
 * This ID is temporary and used for tracking guest sessions without requiring authentication.
 *
 * @function generateGuestUserId
 * @returns {string} A unique string identifier for a guest user.
 */
const generateGuestUserId = () => {
  return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generates a unique conversation ID specifically for code-related conversations.
 * This helps in distinguishing code assistant conversations from other types.
 *
 * @function generateCodeConversationId
 * @returns {string} A unique string identifier for a code conversation.
 */
const generateCodeConversationId = () => {
  return `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Retrieves statistics related to a user's code conversations.
 * This includes the total number of code conversations, total messages exchanged
 * in these conversations, and the average messages per conversation.
 *
 * @function getCodeStats
 * @param {string} userId - The ID of the user for whom to retrieve statistics.
 * @param {object} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to an object containing code conversation statistics:
 *   `totalCodeConversations`, `totalCodeMessages`, and `averageMessagesPerConversation`.
 *   Returns default zero values if an error occurs.
 */
const getCodeStats = async (userId, req = null) => {
  try {
    // Optimization: Use .lean() for read-only operations to improve performance.
    // Assumes conversationHelpers.getUserConversations can accept a lean option.
    const codeConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        page: 1,
        limit: 1000, // Get all for stats
        category: 'code',
      },
      req,
      { lean: true }
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

/**
 * @namespace codeService
 * @description Provides a collection of functions for managing code-related conversations,
 * messages, and statistics within the application. This service acts as an interface
 * to the underlying conversation management system, specifically tailored for code assistant features.
 */
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