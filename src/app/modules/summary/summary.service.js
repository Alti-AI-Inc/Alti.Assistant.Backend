import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { openMemoryClient } from '../../shared/openMemoryClient.js';

/**
 * Generate unique guest user ID.
 * This function creates a new MongoDB ObjectId and converts it to a string,
 * ensuring a unique and valid ID format for guest users.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Manages the lifecycle of a summary conversation.
 * It attempts to retrieve an existing conversation by ID. If not found, not accessible,
 * or no ID is provided, a new summary conversation is created.
 * Supports both authenticated and guest users.
 *
 * @param {string} userId - The ID of the user (authenticated or guest) initiating or accessing the conversation.
 * @param {string} [conversationId] - Optional. The ID of an existing conversation to retrieve. If null, undefined,
 *                                    or if the conversation is not found/accessible, a new one is created.
 * @param {string} summaryQuery - The initial query or topic for the summary conversation, used for title generation.
 * @param {boolean} [isGuest=false] - Optional. True if the user is a guest; otherwise, false.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<object>} A promise that resolves to the conversation object (either existing or newly created).
 * @throws {ApiError} If there's an internal server error handling the conversation.
 */
const handleSummaryConversation = async (
  userId,
  conversationId,
  summaryQuery,
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
        // OPTIMIZATION RECOMMENDATION: If `conversationHelpers.getConversationById` only reads data
        // and the returned `conversation` object is not modified or used with Mongoose document methods
        // (e.g., .save(), virtuals), consider adding `.lean()` to the Mongoose query within
        // `conversationHelpers.getConversationById` for better read performance.

        // For guest users, verify the conversation belongs to them or is a guest conversation
        // If it's not a guest conversation, treat it as not found for this guest user.
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null; // Force creation of new conversation
        }
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found or inaccessible for user ${userId}, creating new one`
        );
        // Ensure conversation is null if an error occurred during retrieval
        conversation = null;
      }
    }

    // Create conversation if it doesn't exist or was not accessible
    if (!conversation) {
      // BUG FIX: If an existing conversationId was provided but not found or accessible,
      // a new conversation should always be created with a newly generated ID,
      // not reusing the potentially invalid or unauthorized client-provided ID.
      const newConversationId = generateSummaryConversationId();

      if (isGuest) {
        // For guest users, create a conversation in the database but mark it as guest
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Summary: ${summaryQuery.substring(0, 50)}${summaryQuery.length > 50 ? '...' : ''}`, // Ensure title is truncated gracefully
            metadata: {
              category: 'summary',
              model: 'summary-agent',
              summaryType: 'assistant',
              userType: 'guest',
              isGuest: true,
            },
          },
          newConversationId,
          req
        );
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Summary: ${summaryQuery.substring(0, 50)}${summaryQuery.length > 50 ? '...' : ''}`, // Ensure title is truncated gracefully
            metadata: {
              category: 'summary',
              model: 'summary-agent',
              summaryType: 'assistant',
              userType: 'authenticated',
            },
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
    logger.error('Error handling summary conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle summary conversation'
    );
  }
};

/**
 * Adds a user's summary query message to a specified conversation.
 * This message is stored in the conversation history and optionally persisted in OpenMemory.
 * Supports both authenticated and guest users.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user (authenticated or guest) sending the message.
 * @param {string} summaryQuery - The content of the user's summary query.
 * @param {boolean} [isGuest=false] - Optional. True if the user is a guest; otherwise, false.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If there's an internal server error adding the message to the conversation.
 */
const addSummaryQueryMessage = async (
  conversationId,
  userId,
  summaryQuery,
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding summary query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the message in the conversation for both guest and authenticated users
    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: summaryQuery,
        metadata: {
          type: 'summary_query',
          timestamp: new Date().toISOString(),
        },
      },
      req
    );

    if (openMemoryClient?.enabled && summaryQuery && userId) {
      try {
        await openMemoryClient.addMemory({
          content: summaryQuery,
          userId,
          tags: ['summary', 'query'],
          metadata: {
            conversationId,
            type: 'summary_query',
            timestamp: new Date().toISOString(),
            isGuest,
          },
          sector: 'episodic',
        });
      } catch (memoryError) {
        logger.warn(
          'Failed to persist summary query in OpenMemory',
          memoryError
        );
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding summary query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add summary query to conversation'
    );
  }
};

/**
 * Adds an assistant's summary result message to a specified conversation.
 * This message is stored in the conversation history and optionally persisted in OpenMemory.
 * Supports both authenticated and guest users.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {string} summaryResult - The content of the assistant's summary result.
 * @param {object} [metadata={}] - Optional. Additional metadata to store with the message and in OpenMemory.
 * @param {boolean} [isGuest=false] - Optional. True if the user is a guest; otherwise, false.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If there's an internal server error adding the message to the conversation.
 */
const addSummaryResultMessage = async (
  conversationId,
  userId,
  summaryResult,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding summary result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the result in the conversation for both guest and authenticated users
    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: summaryResult,
        metadata: {
          type: 'summary_result',
          timestamp: new Date().toISOString(),
          model: 'summary-agent',
          ...metadata,
        },
      },
      req
    );

    if (openMemoryClient?.enabled && summaryResult && userId) {
      try {
        await openMemoryClient.addMemory({
          content: summaryResult,
          userId,
          tags: ['summary', 'answer'],
          metadata: {
            conversationId,
            ...metadata,
            type: metadata?.type || 'summary_result',
            isGuest,
          },
          sector: metadata?.sector || 'semantic',
        });
      } catch (memoryError) {
        logger.warn(
          'Failed to persist summary result in OpenMemory',
          memoryError
        );
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding summary result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add summary result to conversation'
    );
  }
};

/**
 * Adds an error message from the assistant to a specified conversation.
 * This function is designed to log and store error details without throwing further exceptions,
 * preventing cascading failures. Supports both authenticated and guest users.
 *
 * @param {string} conversationId - The ID of the conversation to add the error message to.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {string} errorMessage - The user-friendly error message content to be displayed.
 * @param {Error} originalError - The original error object, used for logging and detailed metadata storage.
 * @param {boolean} [isGuest=false] - Optional. True if the user is a guest; otherwise, false.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<object | void>} A promise that resolves to the saved message object, or void if an error occurs during saving.
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
 * Retrieves a limited history of messages for a given summary conversation.
 * The messages are formatted to include role, content, and timestamp.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve history from.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {number} [limit=10] - Optional. The maximum number of recent messages to retrieve. Defaults to 10.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of formatted message objects.
 *   Each object has:
 *   - `role` {string}: The role of the message sender (e.g., 'user', 'assistant').
 *   - `content` {string}: The content of the message.
 *   - `timestamp` {string}: The ISO string timestamp of when the message was created.
 *   Returns an empty array if the conversation is not found, has no messages, or an error occurs.
 */
const getSummaryHistory = async (
  conversationId,
  userId,
  limit = 10,
  req = null
) => {
  try {
    // Note: This function assumes conversationHelpers.getConversationById correctly
    // handles authorization for both authenticated and guest user IDs.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );
    // OPTIMIZATION RECOMMENDATION: Since the `conversation` object is only read from and its `messages`
    // are transformed into plain objects, consider adding `.lean()` to the Mongoose query within
    // `conversationHelpers.getConversationById` for better read performance.

    if (!conversation || !conversation.messages) {
      return [];
    }

    // Get recent messages and format for summary context
    return conversation.messages.slice(-limit).map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  } catch (error) {
    logger.error('Error getting summary history:', error);
    return [];
  }
};

/**
 * Updates the title of a summary conversation based on the initial summary query.
 * The title is truncated if it exceeds 50 characters.
 * This function logs a warning but does not throw an error if the update fails, as it's not critical.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user (authenticated or guest) who owns the conversation.
 * @param {string} summaryQuery - The query string used to generate the new title.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<void>} A promise that resolves when the title update operation is complete.
 */
const updateConversationTitle = async (
  conversationId,
  userId,
  summaryQuery,
  req = null
) => {
  try {
    const title = `Summary: ${summaryQuery.substring(0, 50)}${summaryQuery.length > 50 ? '...' : ''}`;
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
 * Generates a unique ID for a new summary conversation.
 * The ID is a string combining a prefix, current timestamp, and a random alphanumeric string.
 *
 * @returns {string} A unique string ID for a summary conversation.
 */
const generateSummaryConversationId = () => {
  // Using a custom string for summary conversation IDs.
  // Consider using mongoose.Types.ObjectId().toString() for consistency
  // with MongoDB's native ID format if conversationId is stored as _id.
  return `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Retrieves statistics related to a user's summary conversations.
 * This includes the total number of summary conversations, total messages within them,
 * and the average messages per conversation.
 *
 * @param {string} userId - The ID of the user for whom to retrieve statistics.
 * @param {object} [req=null] - Optional. The Express request object, used for context or tracing.
 * @returns {Promise<object>} A promise that resolves to an object containing summary statistics.
 *   - `totalSummaryConversations` {number}: The total number of summary conversations for the user.
 *   - `totalSummaryMessages` {number}: The total number of messages across all summary conversations for the user.
 *   - `averageMessagesPerConversation` {number}: The average number of messages per summary conversation, rounded to the nearest integer.
 *   Returns default zero values if an error occurs.
 */
const getSummaryStats = async (userId, req = null) => {
  try {
    // Fetching up to 1000 conversations for stats.
    // For users with extremely large numbers of conversations,
    // consider using database aggregation for better performance.
    const summaryConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        page: 1,
        limit: 1000, // Get all for stats
        category: 'summary',
      }
    );
    // OPTIMIZATION RECOMMENDATION: For `conversationHelpers.getUserConversations`, if the returned
    // conversation objects are only used for reading properties (like `messageCount`) and not
    // modified or used with Mongoose document methods, consider adding `.lean()` to the Mongoose
    // query for better read performance.

    // OPTIMIZATION RECOMMENDATION: For users with extremely large numbers of conversations,
    // fetching up to 1000 documents and then reducing them in memory can be inefficient.
    // A more performant approach would be to use MongoDB aggregation directly in the database
    // to calculate `totalSummaryConversations` and `totalSummaryMessages`.
    // Example aggregation (to be implemented in `conversationService` or `conversationHelpers`):
    // await Conversation.aggregate([
    //   { $match: { userId: new mongoose.Types.ObjectId(userId), 'metadata.category': 'summary' } },
    //   { $group: { _id: null, totalSummaryConversations: { $sum: 1 }, totalSummaryMessages: { $sum: '$messageCount' } } }
    // ]);

    const totalSummaries = summaryConversations.conversations.length;
    const totalMessages = summaryConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalSummaryConversations: totalSummaries,
      totalSummaryMessages: totalMessages,
      averageMessagesPerConversation:
        totalSummaries > 0 ? Math.round(totalMessages / totalSummaries) : 0,
    };
  } catch (error) {
    logger.error('Error getting summary stats:', error);
    return {
      totalSummaryConversations: 0,
      totalSummaryMessages: 0,
      averageMessagesPerConversation: 0,
    };
  }
};

/**
 * @typedef {object} SummaryService
 * @property {function(string, string, string, boolean, object): Promise<object>} handleSummaryConversation - Manages the lifecycle of a summary conversation, creating or retrieving it.
 * @property {function(string, string, string, boolean, object): Promise<object>} addSummaryQueryMessage - Adds a user's summary query message to a conversation.
 * @property {function(string, string, string, object, boolean, object): Promise<object>} addSummaryResultMessage - Adds an assistant's summary result message to a conversation.
 * @property {function(string, string, string, Error, boolean, object): Promise<object | void>} addErrorMessage - Adds an error message to a conversation, handling potential failures gracefully.
 * @property {function(string, string, number, object): Promise<Array<object>>} getSummaryHistory - Retrieves a limited history of messages for a summary conversation.
 * @property {function(string, string, string, object): Promise<void>} updateConversationTitle - Updates the title of a summary conversation based on the query.
 * @property {function(): string} generateSummaryConversationId - Generates a unique ID for a new summary conversation.
 * @property {function(): string} generateGuestUserId - Generates a unique ID for a guest user.
 * @property {function(string, object): Promise<object>} getSummaryStats - Retrieves statistics related to a user's summary conversations.
 */

/**
 * Exports an object containing all summary-related service functions.
 * @type {SummaryService}
 */
export const summaryService = {
  handleSummaryConversation,
  addSummaryQueryMessage,
  addSummaryResultMessage,
  addErrorMessage,
  getSummaryHistory,
  updateConversationTitle,
  generateSummaryConversationId,
  generateGuestUserId,
  getSummaryStats,
};