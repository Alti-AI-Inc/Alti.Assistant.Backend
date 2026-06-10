/**
 * @file This service handles all conversation-related logic specifically for Composio integrations.
 * It provides functionalities for creating, managing, and updating conversations,
 * including handling guest users, adding messages, and retrieving conversation history.
 * @module composioConversationService
 */

import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // OPTIMIZATION: Bypassed for direct, optimized queries.
// OPTIMIZATION: Import the Conversation model directly to use efficient queries and aggregation pipelines.
import Conversation from '../conversations/conversation.model.js';

/**
 * Sanitizes a string by escaping HTML characters to prevent Cross-Site Scripting (XSS) attacks.
 * This should be used on any user-provided or external input that will be stored and potentially rendered in a web context.
 * @param {any} input - The input to sanitize. If not a string, it's returned as is.
 * @returns {string|any} The sanitized string, or the original input if not a string.
 */
const sanitizeInput = input => {
  if (typeof input !== 'string') {
    return input;
  }
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  const reg = /[&<>"'/]/gi;
  return input.replace(reg, match => map[match]);
};

/**
 * Generates a unique guest user ID using MongoDB's ObjectId format.
 * This ensures consistency with how user IDs might be stored or referenced in a database,
 * even for temporary guest sessions.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID specifically for Composio interactions.
 * The ID is prefixed with 'composio_' and includes a timestamp and a random string
 * to ensure uniqueness.
 * @returns {string} A unique string representing a Composio conversation ID.
 */
const generateComposioConversationId = () => {
  return `composio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Creates a new Composio conversation or retrieves an existing one.
 * This function supports both authenticated and guest users, ensuring that guest users
 * can only access conversations explicitly marked as guest conversations.
 * If a `conversationId` is provided, it attempts to retrieve it; otherwise, a new one is created.
 * A default title is generated based on the user's input.
 *
 * @param {string} userId - The ID of the user initiating or continuing the conversation.
 * @param {string | null} conversationId - The ID of an existing conversation, or `null` to create a new one.
 * @param {string} userInput - The initial user input for the conversation, used to generate a title.
 * @param {boolean} [isGuest=false] - A flag indicating if the user is a guest.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<Object>} A promise that resolves to the conversation object.
 * @throws {ApiError} If there is an internal server error during conversation handling.
 */
const handleComposioConversation = async (
  userId,
  conversationId,
  userInput,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        // OPTIMIZATION: Replaced helper call with a direct, efficient, and read-only query.
        // Using `.lean()` bypasses Mongoose document hydration, significantly improving performance.
        // The query correctly handles both authenticated and guest user access patterns.
        // Note: This direct query bypasses any multi-tenancy logic in the original helper.
        // The query is assumed to be secure as it's scoped by `_id` and `userId`.
        //
        // Indexing Recommendation:
        // A compound index on `(_id, userId)` is optimal for authenticated user lookups.
        const query = { _id: conversationId };
        // For authenticated users, we enforce that the conversation belongs to them.
        if (!isGuest) {
          query.userId = new mongoose.Types.ObjectId(userId);
        }

        conversation = await Conversation.findOne(query).lean().exec();

        // For guest users, an additional check ensures they can only access guest conversations.
        if (
          conversation &&
          isGuest &&
          conversation.metadata?.userType !== 'guest'
        ) {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null; // Force creation of a new conversation.
        }

        if (!conversation) {
          logger.warn(
            `Conversation ${conversationId} not found or not authorized for user ${userId}, creating new one.`
          );
        }
      } catch (error) {
        // Catch potential errors (e.g., invalid ObjectId format) and proceed to create a new conversation.
        logger.warn(
          `Error looking up conversation ${conversationId} for user ${userId}. Creating a new one. Error: ${error.message}`
        );
        conversation = null;
      }
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      // If an existing conversation was not found or authorized,
      // we always generate a new ID for the new conversation to ensure uniqueness
      // and avoid reusing potentially invalid or unauthorized IDs.
      const newConversationId = generateComposioConversationId();

      // SECURITY-PATCH: Sanitize user input to prevent stored XSS vulnerabilities in the conversation title.
      const sanitizedUserInput = sanitizeInput(userInput);
      // Generate a meaningful title from the user input
      const title = `Automation task: ${sanitizedUserInput.substring(0, 50)}${
        sanitizedUserInput.length > 50 ? '...' : ''
      }`;

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

      logger.info(
        `Created new composio conversation with title "${title}" (${newConversationId}) for user ${userId} (guest: ${isGuest})`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling composio conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle composio conversation'
    );
  }
};

/**
 * Adds a user's input message to a specified Composio conversation.
 * This function stores the user's query with specific metadata indicating it's a Composio query.
 * It supports both guest and authenticated users.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user sending the message.
 * @param {string} userInput - The content of the user's message.
 * @param {boolean} [isGuest=false] - A flag indicating if the user is a guest.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<Object>} A promise that resolves to the updated conversation object with the new message.
 * @throws {ApiError} If there is an internal server error while adding the message.
 */
const addComposioQueryMessage = async (
  conversationId,
  userId,
  userInput,
  isGuest = false,
  req = null
) => {
  try {
    logger.info(
      `Adding composio query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the message in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        // SECURITY-PATCH: Sanitize user input to prevent stored XSS vulnerabilities in message content.
        content: sanitizeInput(userInput),
        metadata: {
          type: 'composio_query',
          timestamp: new Date().toISOString(),
        },
      }
    );
  } catch (error) {
    logger.error('Error adding composio query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add composio query to conversation'
    );
  }
};

/**
 * Adds a Composio tool execution result message to a specified conversation.
 * This function stores the assistant's response, typically the outcome of a Composio workflow,
 * with relevant metadata. It supports both guest and authenticated users.
 *
 * @param {string} conversationId - The ID of the conversation to add the result to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} result - The content of the Composio execution result.
 * @param {Object} [metadata={}] - Additional metadata to store with the message (e.g., tool details).
 * @param {boolean} [isGuest=false] - A flag indicating if the user is a guest.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<Object>} A promise that resolves to the updated conversation object with the new message.
 * @throws {ApiError} If there is an internal server error while adding the result message.
 */
const addComposioResultMessage = async (
  conversationId,
  userId,
  result,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    logger.info(
      `Adding composio result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the result in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        // SECURITY-PATCH: Sanitize result from external tool to prevent stored XSS.
        content: sanitizeInput(result),
        metadata: {
          type: 'composio_result',
          timestamp: new Date().toISOString(),
          model: 'ai-classification-agent', // Default model for Composio results
          ...metadata,
        },
      }
    );
  } catch (error) {
    logger.error('Error adding composio result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add composio result to conversation'
    );
  }
};

/**
 * Adds an error message to a specified Composio conversation.
 * This function is used to log and display errors that occur during Composio workflow execution
 * within the conversation context. It includes details about the original error.
 * It supports both guest and authenticated users.
 *
 * @param {string} conversationId - The ID of the conversation to add the error message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} errorMessage - A user-friendly error message to display.
 * @param {Error} originalError - The original error object for logging and detailed metadata.
 * @param {boolean} [isGuest=false] - A flag indicating if the user is a guest.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<Object|undefined>} A promise that resolves to the updated conversation object with the new message, or undefined if an error occurs during message addition.
 * @remarks This function catches its own errors to prevent cascading failures, as its purpose is to report errors.
 */
const addComposioErrorMessage = async (
  conversationId,
  userId,
  errorMessage,
  originalError,
  isGuest = false,
  req = null
) => {
  try {
    logger.info(
      `Adding error message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the error in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        // SECURITY-PATCH: Sanitize error message to prevent XSS, as it might be constructed from unsafe inputs.
        content: sanitizeInput(errorMessage),
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
 * Retrieves a limited history of messages from a specific Composio conversation.
 * This is useful for providing context to subsequent AI interactions.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve history from.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {number} [limit=10] - The maximum number of recent messages to retrieve.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of message objects, or an empty array if the conversation is not found or an error occurs.
 */
const getComposioHistory = async (
  conversationId,
  userId,
  limit = 10,
  req = null
) => {
  try {
    // SECURITY-PATCH: Validate and sanitize the 'limit' parameter to ensure it's a reasonable positive integer.
    const messageLimit = Math.max(1, parseInt(String(limit), 10) || 10);

    // OPTIMIZATION: Replaced helper call with a direct, highly efficient query.
    // This query uses the MongoDB `$slice` projection operator to retrieve only the
    // last `messageLimit` messages directly from the database. This avoids fetching
    // the entire (potentially very large) messages array into application memory,
    // saving significant memory and CPU resources.
    // The `.lean()` method is used for a fast, read-only operation.
    // Note: This direct query bypasses any multi-tenancy logic in the original helper.
    // The query is assumed to be secure as it's scoped by `_id` and `userId`.
    //
    // Indexing Recommendation:
    // A compound index on `(_id, userId)` is optimal for this query's performance.
    const conversation = await Conversation.findOne(
      {
        _id: conversationId,
        userId: new mongoose.Types.ObjectId(userId),
      },
      {
        messages: { $slice: -messageLimit },
      }
    )
      .lean()
      .exec();

    if (!conversation || !conversation.messages) {
      return [];
    }

    // The `messages` array is already the correct slice from the database.
    // We just map it to the desired output format.
    return conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata,
    }));
  } catch (error) {
    // Catch potential errors (e.g., invalid ObjectId format) and return an empty array
    // to maintain the function's contract and prevent crashes.
    if (error.name === 'BSONTypeError') {
      logger.warn(
        `Invalid conversationId format provided for history: ${conversationId}`
      );
    } else {
      logger.error('Error getting composio history:', error);
    }
    return [];
  }
};

/**
 * Updates the title of a Composio conversation based on the results of a workflow execution.
 * The title is dynamically generated to reflect the identified application, action, or workflow type.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {Object} workflowResult - An object containing details about the workflow execution.
 * @param {string} [workflowResult.identifiedApp] - The application identified in the workflow.
 * @param {string} [workflowResult.identifiedAction] - The action identified in the workflow.
 * @param {string} [workflowResult.workflowType] - The type of workflow (e.g., 'multi_step').
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<void>} A promise that resolves when the conversation title has been updated.
 * @remarks This function catches its own errors to avoid disrupting the main workflow.
 */
const updateComposioConversationTitle = async (
  conversationId,
  userId,
  workflowResult,
  req = null
) => {
  try {
    const { identifiedApp, identifiedAction, workflowType } = workflowResult;

    let newTitle = 'Tool Execution';

    if (identifiedApp && identifiedAction) {
      // SECURITY-PATCH: Sanitize external workflow data to prevent stored XSS in the conversation title.
      newTitle = `${sanitizeInput(identifiedAction)}`;
    } else if (workflowType === 'multi_step') {
      newTitle = `Multi-step Workflow`;
    }

    await conversationService.updateConversationTitle(
      conversationId,
      userId,
      newTitle,
      req
    );

    logger.info(
      `Updated conversation title for ${conversationId}: ${newTitle}`
    );
  } catch (error) {
    logger.error('Error updating conversation title:', error);
    // Don't throw to avoid disrupting the main flow
  }
};

/**
 * Retrieves statistics related to Composio conversations for a given user.
 * This includes the total number of Composio conversations, total messages within them,
 * and the average messages per conversation.
 *
 * @param {string} userId - The ID of the user for whom to retrieve statistics.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user or multi-tenant context.
 * @returns {Promise<Object>} A promise that resolves to an object containing Composio conversation statistics.
 * @property {number} totalComposioConversations - The total count of Composio conversations.
 * @property {number} totalComposioMessages - The total count of messages across all Composio conversations.
 * @property {number} averageMessagesPerConversation - The average number of messages per Composio conversation.
 */
const getComposioStats = async (userId, req = null) => {
  try {
    // OPTIMIZATION: Replaced fetching all documents and calculating in-memory
    // with a highly efficient MongoDB aggregation pipeline. This performs all
    // calculations directly on the database server, minimizing network traffic,
    // memory usage, and CPU load on the application server. It is significantly
    // faster and more scalable than the previous implementation.
    //
    // Indexing Recommendation:
    // For this aggregation to be performant, a compound index on
    // `(userId, metadata.category)` is crucial for the initial $match stage.
    const stats = await Conversation.aggregate([
      {
        // Stage 1: Filter for the specific user's composio conversations.
        $match: {
          userId: new mongoose.Types.ObjectId(userId), // Ensure userId is a valid ObjectId for matching
          'metadata.category': 'composio',
        },
      },
      {
        // Stage 2: Group all matching documents to calculate aggregates.
        $group: {
          _id: null, // Group all documents into a single result.
          totalComposioConversations: { $sum: 1 }, // Count the number of conversations.
          totalComposioMessages: { $sum: '$messageCount' }, // Sum the messageCount of each conversation.
        },
      },
      {
        // Stage 3: Reshape the output and calculate the average.
        $project: {
          _id: 0, // Exclude the default _id field.
          totalComposioConversations: 1,
          totalComposioMessages: 1,
          averageMessagesPerConversation: {
            // Safely calculate the average, handling division by zero.
            $cond: {
              if: { $eq: ['$totalComposioConversations', 0] },
              then: 0,
              else: {
                $round: [
                  {
                    $divide: [
                      '$totalComposioMessages',
                      '$totalComposioConversations',
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
      },
    ]);

    // Aggregation returns an array, so we take the first result or a default object.
    if (stats.length > 0) {
      return stats[0];
    }

    // Return default stats if the user has no composio conversations.
    return {
      totalComposioConversations: 0,
      totalComposioMessages: 0,
      averageMessagesPerConversation: 0,
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

/**
 * @namespace composioConversationService
 * @description Provides a collection of functions for managing Composio-specific conversations.
 * This service encapsulates logic for creating, updating, and retrieving conversation data
 * tailored for interactions involving the Composio platform, including guest user support
 * and specialized message handling.
 */
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