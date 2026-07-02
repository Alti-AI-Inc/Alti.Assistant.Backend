import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { openMemoryClient } from '../../shared/openMemoryClient.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationService } from '../conversations/conversation.service.js';

// Optimization Note: For the Conversation model (likely used by conversationHelpers and conversationService),
// consider adding indexes for frequently queried fields to improve read performance:
// - `userId`: For efficient lookup of conversations by user.
// - `metadata.category`: For filtering conversations by category (e.g., 'search').
// A compound index like `{ userId: 1, 'metadata.category': 1 }` could be highly beneficial for queries that filter by both.

/**
 * Generates a unique guest user ID using MongoDB's ObjectId format.
 * This ensures consistency with how user IDs might be stored and indexed in a MongoDB environment,
 * even for temporary guest sessions.
 * @returns {string} A unique string representing a guest user's ID.
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Handles the creation or retrieval of a search conversation for both authenticated and guest users.
 * If a `conversationId` is provided, it attempts to retrieve the existing conversation.
 * If no conversation is found or if the provided `conversationId` does not belong to the user (especially for guests),
 * a new conversation is created.
 *
 * @param {string} userId - The ID of the user (authenticated user ID or generated guest user ID).
 * @param {string | null} conversationId - Optional. The ID of an existing conversation to retrieve. If null or not found, a new one is created.
 * @param {string} searchQuery - The initial search query, used for titling new conversations.
 * @param {boolean} [isGuest=false] - Indicates if the current user is a guest.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management in underlying services.
 * @returns {Promise<Object>} A promise that resolves to the conversation object (either existing or newly created).
 * @throws {ApiError} If an internal server error occurs during conversation handling.
 *
 * @fixme Potential IDOR vulnerability: The `userId` parameter for `getConversationById`
 * should always be provided to ensure ownership verification, even for guest users.
 * `userId` for guest users is their generated unique ID, not `null`.
 * The `getConversationById` function is expected to verify that the `conversationId`
 * belongs to the provided `userId`. This has been addressed in the implementation by always passing `userId`.
 *
 * @optimization If `conversationHelpers.getConversationById` only reads data
 * and doesn't modify the Mongoose document in this context, consider adding `.lean()`
 * to the query within `getConversationById` for better performance by returning a plain JS object.
 */
const handleSearchConversation = async (
  userId,
  conversationId,
  searchQuery,
  isGuest = false,
  req = null,
  category = 'search'
) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation for both authenticated and guest users
      try {
        // FIX: Potential IDOR vulnerability. The `userId` parameter for `getConversationById`
        // should always be provided to ensure ownership verification, even for guest users.
        // `userId` for guest users is their generated unique ID, not `null`.
        // The `getConversationById` function is expected to verify that the `conversationId`
        // belongs to the provided `userId`.
        // Optimization Note: If conversationHelpers.getConversationById only reads data
        // and doesn't modify the Mongoose document in this context, consider adding .lean()
        // to the query within getConversationById for better performance by returning a plain JS object.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId, // Always pass userId for ownership verification
          req
        );

        // For guest users, verify the conversation belongs to them or is a guest conversation
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null; // Force creation of new conversation
          conversationId = null; // Avoid reusing an unauthorized conversationId
        }
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found for user ${userId}, creating new one`
        );
        conversationId = null; // Avoid reusing a conversationId that exists but is not accessible
      }
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const newConversationId =
        conversationId || generateSearchConversationId();

      const resolvedCategory = category || 'search';

      if (isGuest) {
        // For guest users, create a conversation in the database but mark it as guest
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Search: ${searchQuery.substring(0, 50)}...`,
            metadata: {
              category: resolvedCategory,
              model: 'research-agent',
              searchType: 'assistant',
              userType: 'guest',
              isGuest: true,
            },
            is_deep_search: false,
          },
          newConversationId,
          req
        );
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Search: ${searchQuery.substring(0, 50)}...`,
            metadata: {
              category: resolvedCategory,
              model: 'research-agent',
              searchType: 'assistant',
              userType: 'authenticated',
            },
            is_deep_search: false,
          },
          newConversationId,
          req
        );
      }

      console.log(
        `Created new conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling search conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to handle search conversation'
    );
  }
};

/**
 * Adds a user's search query as a message to a specified conversation.
 * This function supports both authenticated and guest users and optionally persists the query
 * to an OpenMemory client if enabled.
 *
 * @param {string} conversationId - The ID of the conversation to which the message will be added.
 * @param {string} userId - The ID of the user (authenticated or guest) performing the search.
 * @param {string} searchQuery - The actual search query text.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management.
 * @returns {Promise<Object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If an internal server error occurs during message addition.
 */
const addSearchQueryMessage = async (
  conversationId,
  userId,
  searchQuery,
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding search query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

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
      },
      req
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
        logger.warn(
          'Failed to persist search query in OpenMemory',
          memoryError
        );
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding search query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add search query to conversation'
    );
  }
};

/**
 * Adds a search result message (from the assistant) to a specified conversation.
 * This function supports both authenticated and guest users and optionally persists the result
 * to an OpenMemory client if enabled.
 *
 * @param {string} conversationId - The ID of the conversation to which the message will be added.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {string} searchResult - The content of the search result provided by the assistant.
 * @param {Object} [metadata={}] - Additional metadata to store with the message and in OpenMemory.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management.
 * @returns {Promise<Object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If an internal server error occurs during message addition.
 */
const addSearchResultMessage = async (
  conversationId,
  userId,
  searchResult,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding search result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

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
      },
      req
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
        logger.warn(
          'Failed to persist search result in OpenMemory',
          memoryError
        );
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding search result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add search result to conversation'
    );
  }
};

/**
 * Adds an error message (from the assistant) to a specified conversation.
 * This function is used to log operational errors within the conversation flow,
 * making them visible to the user. It supports both authenticated and guest users.
 * Errors during this process are logged but not re-thrown to prevent cascading failures.
 *
 * @param {string} conversationId - The ID of the conversation to which the error message will be added.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {string} errorMessage - The user-friendly error message to display.
 * @param {Error} originalError - The original error object, used for logging and potentially storing its message in metadata.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management.
 * @returns {Promise<Object | void>} A promise that resolves to the saved message object, or void if an error occurs during message addition.
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

    let targetConversationId = conversationId;
    let conversationExists = false;

    if (targetConversationId) {
      try {
        await conversationHelpers.getConversationById(
          targetConversationId,
          userId,
          req
        );
        conversationExists = true;
      } catch (error) {
        logger.warn(
          `Target conversation ${targetConversationId} not found for user ${userId}. Creating a new conversation instead.`,
          { userId, isGuest, originalConversationId: targetConversationId }
        );
        targetConversationId = null; // Avoid reusing a missing or unauthorized conversation ID
      }
    }

    if (!conversationExists) {
      const newConversation = await handleSearchConversation(
        userId,
        targetConversationId,
        'Search error',
        isGuest,
        req
      );
      targetConversationId = newConversation.conversationId;
    }

    return await conversationService.addMessageToConversation(
      targetConversationId,
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
 * Retrieves a limited history of messages from a specific conversation,
 * formatted for use as search context.
 *
 * @param {string} conversationId - The ID of the conversation from which to retrieve history.
 * @param {string} userId - The ID of the user associated with the conversation (for ownership verification).
 * @param {number} [limit=10] - The maximum number of recent messages to retrieve.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of message objects,
 *                                    each containing `role`, `content`, and `timestamp`.
 *                                    Returns an empty array if the conversation is not found or has no messages,
 *                                    or if an error occurs.
 *
 * @optimization Since this function only reads conversation data and its messages,
 * ensure that `conversationHelpers.getConversationById` uses `.lean()` for optimal performance
 * by returning a plain JS object instead of a full Mongoose document.
 */
const getSearchHistory = async (
  conversationId,
  userId,
  limit = 10,
  req = null
) => {
  try {
    // Optimization Note: Since this function only reads conversation data and its messages,
    // ensure that conversationHelpers.getConversationById uses .lean() for optimal performance
    // by returning a plain JS object instead of a full Mongoose document.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation || !conversation.messages) {
      return [];
    }

    // Get recent messages and format for search context
    return conversation.messages.slice(-limit).map((msg) => ({
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
 * Updates the title of a specific conversation based on a new search query.
 * This function is typically called after an initial search to provide a meaningful title.
 * Errors during this process are logged but not re-thrown as title updates are not critical.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user associated with the conversation (for ownership verification).
 * @param {string} searchQuery - The search query used to generate the new title.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management.
 * @returns {Promise<void>} A promise that resolves when the title update is attempted.
 */
const updateConversationTitle = async (
  conversationId,
  userId,
  searchQuery,
  req = null
) => {
  try {
    const title = `Search: ${searchQuery.substring(0, 50)}${searchQuery.length > 50 ? '...' : ''}`;
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
 * Generates a unique conversation ID for search conversations using MongoDB's ObjectId format.
 * This ensures consistency with how conversation IDs are stored and indexed in a MongoDB environment.
 *
 * @returns {string} A unique string representing a new conversation's ID.
 *
 * @fixme Inconsistent conversation ID generation: If conversation IDs are expected
 * to be MongoDB ObjectIds (as implied by `generateGuestUserId`), this function
 * should also generate a valid ObjectId to prevent Mongoose validation/cast errors
 * when creating new conversations. This has been addressed in the implementation.
 */
const generateSearchConversationId = () => {
  // FIX: Inconsistent conversation ID generation. If conversation IDs are expected
  // to be MongoDB ObjectIds (as implied by `generateGuestUserId`), this function
  // should also generate a valid ObjectId to prevent Mongoose validation/cast errors
  // when creating new conversations.
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Retrieves statistics related to search conversations for a given user.
 * This includes the total number of search conversations, total messages across them,
 * and the average messages per conversation.
 *
 * @param {string} userId - The ID of the user for whom to retrieve search statistics.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for context or transaction management.
 * @returns {Promise<Object>} A promise that resolves to an object containing search statistics:
 *   - `totalSearchConversations`: The total count of search conversations.
 *   - `totalSearchMessages`: The total number of messages across all search conversations.
 *   - `averageMessagesPerConversation`: The average number of messages per search conversation, rounded to the nearest integer.
 *                                       Returns 0 if no search conversations are found.
 *                                       Returns default values if an error occurs.
 *
 * @optimization Since this function only reads conversation data for aggregation (length, messageCount),
 * ensure that `conversationHelpers.getUserConversations` uses `.lean()` for optimal performance
 * by returning plain JS objects instead of full Mongoose documents.
 */
const getSearchStats = async (userId, req = null) => {
  try {
    // Optimization Note: Since this function only reads conversation data for aggregation (length, messageCount),
    // ensure that conversationHelpers.getUserConversations uses .lean() for optimal performance
    // by returning plain JS objects instead of full Mongoose documents.
    const searchConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        page: 1,
        limit: 1000, // Get all for stats
        category: 'search',
      }
    );

    const totalSearches = searchConversations.conversations.length;
    const totalMessages = searchConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalSearchConversations: totalSearches,
      totalSearchMessages: totalMessages,
      averageMessagesPerConversation:
        totalSearches > 0 ? Math.round(totalMessages / totalSearches) : 0,
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

/**
 * @namespace searchService
 * @description Provides a collection of functions for managing search-related conversations and messages.
 * This service abstracts the interaction with conversation management and memory persistence,
 * supporting both authenticated and guest user flows for search functionalities.
 */
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
