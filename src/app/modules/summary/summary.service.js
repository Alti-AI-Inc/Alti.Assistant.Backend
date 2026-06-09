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
 * Create or get summary conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} summaryQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Add summary query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} summaryQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Add summary result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} summaryResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Process summary history for context
 * @param {string} conversationId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
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
 * Update conversation title based on summary query
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} summaryQuery
 * @returns {Promise<void>}
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
 * Generate unique conversation ID for summary
 * @returns {string}
 */
const generateSummaryConversationId = () => {
  // Using a custom string for summary conversation IDs.
  // Consider using mongoose.Types.ObjectId().toString() for consistency
  // with MongoDB's native ID format if conversationId is stored as _id.
  return `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get summary conversation statistics
 * @param {string} userId
 * @returns {Promise<Object>}
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