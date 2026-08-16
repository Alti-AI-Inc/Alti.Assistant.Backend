import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationService } from '../conversations/conversation.service.js';

/**
 * Generates a unique guest user ID using MongoDB's ObjectId format.
 * This ensures that guest user IDs are distinct and follow a common ID structure
 * even if they are not stored in a full user collection.
 *
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID specifically for deep research conversations.
 * The ID is prefixed with 'dr_' for easy identification and includes a timestamp
 * and a random string to ensure uniqueness.
 *
 * @returns {string} A unique string representing a deep research conversation ID.
 */
const generateDeepResearchConversationId = () => {
  return `dr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of a deep research conversation.
 * This function supports both authenticated and guest users, ensuring that
 * conversations are properly associated with their respective owners and types.
 * If a `conversationId` is provided, it attempts to retrieve an existing conversation
 * and performs ownership and type verification. If no valid conversation is found
 * or accessible, a new deep research conversation is created.
 *
 * @param {string} userId - The ID of the user (or guest user) initiating the deep research.
 * @param {string | null} conversationId - Optional. The ID of an existing conversation to retrieve.
 *                                        If null or invalid, a new conversation will be created.
 * @param {string} researchQuery - The initial research query, used for titling new conversations.
 * @param {boolean} [isGuest=false] - Indicates whether the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<object>} A promise that resolves to the conversation object (either existing or newly created).
 * @throws {ApiError} If an unexpected error occurs during conversation handling.
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
      // Attempt to retrieve an existing conversation using the provided conversationId
      try {
        // SECURITY FIX: Always pass the userId for ownership verification.
        // The conversationHelpers.getConversationById function is expected to handle
        // filtering by userId and potentially by userType (guest/authenticated).
        // PERFORMANCE OPTIMIZATION: If 'conversationHelpers.getConversationById' returns a Mongoose document
        // and no modifications are saved back to the database from this function,
        // consider adding '.lean()' to the underlying Mongoose query in 'getConversationById'
        // to return a plain JavaScript object for better performance.
        // Example (if conversationHelpers supports options):
        // conversation = await conversationHelpers.getConversationById(conversationId, userId, { lean: true }, req);
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId, // Pass the actual userId (guest ID if isGuest is true)
          req
        );

        // SECURITY FIX: Explicit ownership and type verification after fetching.
        // This adds an extra layer of security in case getConversationById is not strict enough,
        // or to handle guest-specific access rules.
        if (conversation) {
          if (isGuest) {
            // For guest users, verify the conversation belongs to them AND is a guest conversation.
            if (
              conversation.userId !== userId ||
              conversation.metadata?.userType !== 'guest'
            ) {
              logger.warn(
                `Guest user ${userId} tried to access non-owned or non-guest conversation ${conversationId}. Forcing new conversation.`
              );
              conversation = null; // Invalidate conversation, force creation of a new one.
            }
          } else {
            // For authenticated users, ensure it belongs to them.
            if (conversation.userId !== userId) {
              logger.warn(
                `Authenticated user ${userId} tried to access non-owned conversation ${conversationId}. Forcing new conversation.`
              );
              conversation = null; // Invalidate conversation, force creation of a new one.
            }
          }
        }
      } catch (error) {
        // Log the error but don't rethrow, as we'll proceed to create a new conversation.
        logger.warn(
          `Conversation ${conversationId} not found or inaccessible for user ${userId}. Error: ${error.message}. Creating new one.`
        );
        conversation = null; // Ensure conversation is null if an error occurred during retrieval.
      }
    }

    // If no valid existing conversation was found or retrieved, create a new one.
    if (!conversation) {
      // BUG FIX: Always generate a new unique ID for a new conversation.
      // The 'conversationId' parameter is only for attempting to retrieve an existing one;
      // if that fails, we don't reuse the potentially invalid or conflicting ID for creation.
      const newConversationId = generateDeepResearchConversationId();

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
          newConversationId, // Use the newly generated ID
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
          newConversationId, // Use the newly generated ID
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
 * Adds a user's deep research query message to a specified conversation.
 * This function supports both authenticated and guest users, ensuring the message
 * is correctly attributed and stored within the conversation history.
 *
 * @param {string} conversationId - The ID of the conversation to which the message will be added.
 * @param {string} userId - The ID of the user (or guest user) sending the query.
 * @param {string} researchQuery - The content of the deep research query message.
 * @param {boolean} [isGuest=false] - Indicates whether the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<object>} A promise that resolves to the updated conversation object or the newly added message object.
 * @throws {ApiError} If an error occurs while adding the message to the conversation.
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
    // Assuming conversationService.addMessageToConversation handles ownership verification
    // for both authenticated and guest users based on userId and conversationId.
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
 * Adds a deep research result message (from the assistant) to a specified conversation.
 * This function supports both authenticated and guest users, ensuring the result
 * is correctly attributed and stored within the conversation history.
 *
 * @param {string} conversationId - The ID of the conversation to which the result message will be added.
 * @param {string} userId - The ID of the user (or guest user) associated with the conversation.
 * @param {string} researchResult - The content of the deep research result message.
 * @param {object} [metadata={}] - Additional metadata to be stored with the message.
 * @param {boolean} [isGuest=false] - Indicates whether the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<object>} A promise that resolves to the updated conversation object or the newly added message object.
 * @throws {ApiError} If an error occurs while adding the result message to the conversation.
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
    // Assuming conversationService.addMessageToConversation handles ownership verification
    // for both authenticated and guest users based on userId and conversationId.
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
 * Adds an error message (from the assistant) to a specified conversation.
 * This function is used to log operational errors within the conversation flow,
 * making them visible to the user. It supports both authenticated and guest users.
 * Errors during this process are logged but not re-thrown to prevent cascading failures.
 *
 * @param {string} conversationId - The ID of the conversation to which the error message will be added.
 * @param {string} userId - The ID of the user (or guest user) associated with the conversation.
 * @param {string} errorMessage - The user-friendly error message content.
 * @param {Error} originalError - The original error object, used for logging internal details.
 * @param {boolean} [isGuest=false] - Indicates whether the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<object | void>} A promise that resolves to the updated conversation object or the newly added message object,
 *                                   or `void` if an error occurs during the addition of the error message itself.
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
    // Assuming conversationService.addMessageToConversation handles ownership verification
    // for both authenticated and guest users based on userId and conversationId.
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
    if (error?.statusCode === httpStatus.NOT_FOUND) {
      logger.warn(
        'Skipped adding error message because conversation was not found',
        {
          conversationId,
          userId,
        }
      );
      return;
    }
    logger.error('Error adding error message:', error);
    // Don't throw here to avoid cascading errors
  }
};

/**
 * Retrieves a limited history of messages for a specific deep research conversation.
 * This function fetches messages from the conversation and formats them for use
 * as context in subsequent deep research operations. It performs ownership verification.
 *
 * @param {string} conversationId - The ID of the conversation from which to retrieve history.
 * @param {string} userId - The ID of the user (or guest user) who owns the conversation.
 * @param {number} [limit=5] - The maximum number of recent messages to retrieve. Defaults to 5.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of formatted message objects,
 *                                   or an empty array if the conversation is not found or an error occurs.
 */
const getDeepResearchHistory = async (
  conversationId,
  userId,
  limit = 5,
  req = null
) => {
  try {
    // Assuming conversationHelpers.getConversationById handles ownership verification
    // for both authenticated and guest users based on userId and conversationId.
    // PERFORMANCE OPTIMIZATION: Since the conversation object is only read and not modified/saved,
    // consider adding '.lean()' to the underlying Mongoose query in 'getConversationById'
    // to return a plain JavaScript object for better performance.
    // Example (if conversationHelpers supports options):
    // const conversation = await conversationHelpers.getConversationById(conversationId, userId, { lean: true }, req);
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
 * Updates the title of a deep research conversation based on a new research query.
 * For authenticated users, this updates the conversation title in the database.
 * For guest users, it only logs the intended title update as guest conversations
 * might have different persistence or update mechanisms.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user (or guest user) who owns the conversation.
 * @param {string} researchQuery - The new research query, used to generate the updated title.
 * @param {boolean} [isGuest=false] - Indicates whether the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<object>} A promise that resolves to an object indicating success and any relevant information,
 *                            or an object with an error message if the update fails for authenticated users.
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
      // For guest users, just log the title update as per current design.
      logger.info(
        `Guest user ${userId} conversation ${conversationId} title update: ${researchQuery.substring(0, 50)}...`
      );
      return { success: true, isGuest: true };
    }

    const newTitle = `Deep Research: ${researchQuery.substring(0, 50)}...`;
    // Assuming conversationService.updateConversationTitle handles ownership verification
    // for authenticated users based on userId and conversationId.
    return await conversationService.updateConversationTitle(
      conversationId,
      userId,
      newTitle,
      req
    );
  } catch (error) {
    logger.error('Error updating conversation title:', error);
    // Don't throw here as it's not critical for core functionality.
    return { success: false, error: error.message };
  }
};

/**
 * Retrieves deep research statistics for a given user.
 * This includes the total number of deep research conversations,
 * total messages across these conversations, and the average messages per conversation.
 *
 * @param {string} userId - The ID of the user for whom to retrieve statistics.
 * @param {object} [req=null] - The Express request object, potentially used for context or logging in downstream services.
 * @returns {Promise<object>} A promise that resolves to an object containing deep research statistics.
 *                            Returns default zero values if an error occurs.
 * @property {number} totalDeepResearchConversations - The total count of deep research conversations.
 * @property {number} totalDeepResearchMessages - The total count of messages across all deep research conversations.
 * @property {number} averageMessagesPerConversation - The average number of messages per deep research conversation, rounded to the nearest integer.
 */
const getDeepResearchStats = async (userId, req = null) => {
  try {
    // Get all deep research conversations for the user.
    // PERFORMANCE/BUG FIX: Changed limit from 1000 to 0 (or a very large number)
    // assuming conversationHelpers.getUserConversations supports fetching all
    // when limit is 0 or not provided, for accurate statistics.
    // PERFORMANCE OPTIMIZATION:
    // 1. Indexing: For efficient querying by userId and category, ensure an index exists on the 'Conversation' collection:
    //    `db.conversations.createIndex({ userId: 1, 'metadata.category': 1 })`
    // 2. Lean Queries: Since the fetched conversations are only used for aggregation (counting),
    //    the underlying Mongoose query in 'conversationHelpers.getUserConversations' should use '.lean()'
    //    to return plain JavaScript objects, reducing overhead.
    // 3. Projection: To minimize data transfer and memory usage, the query should ideally project only
    //    the necessary fields, e.g., `_id` and `messageCount`.
    //    Example (if conversationHelpers supports options):
    //    const deepResearchConversationsResult = await conversationHelpers.getUserConversations(
    //      userId,
    //      { limit: 0, category: 'deep_research', lean: true, select: '_id messageCount' },
    //      req
    //    );
    const deepResearchConversationsResult =
      await conversationHelpers.getUserConversations(
        userId,
        {
          limit: 0, // Fetch all conversations for accurate statistics
          category: 'deep_research',
        },
        req
      );

    // BUG FIX: Add null/undefined check for conversations array
    const deepResearchConversations =
      deepResearchConversationsResult?.conversations || [];

    const totalDeepResearches = deepResearchConversations.length;
    const totalMessages = deepResearchConversations.reduce(
      (sum, conv) => sum + (conv.messageCount || 0), // BUG FIX: Ensure messageCount is treated as 0 if undefined
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

/**
 * @namespace deepResearchService
 * @description Provides a collection of service functions for managing deep research conversations,
 *              including creation, message handling, history retrieval, title updates, and statistics.
 *              It supports both authenticated and guest users with appropriate ownership and type verification.
 */
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
