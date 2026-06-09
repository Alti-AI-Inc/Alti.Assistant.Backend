/**
 * @file This service handles all conversation-related logic specifically for Composio integrations.
 * It provides functionalities for creating, managing, and updating conversations,
 * including handling guest users, adding messages, and retrieving conversation history.
 * @module composioConversationService
 */

import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';

/**
 * Generates a unique guest user ID using MongoDB's ObjectId format.
 * This ensures consistency with how user IDs might be stored or referenced in a database,
 * even for temporary guest sessions.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
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
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
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
          conversation = null; // Force creation of new conversation if it's not a guest conversation
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
        conversationId || generateComposioConversationId();

      // Generate a meaningful title from the user input
      const title = `Automation task: ${userInput.substring(0, 50)}${userInput.length > 50 ? '...' : ''}`;

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

      console.log(
        `Created new composio conversation with title ${title} ${newConversationId} for user ${userId} (guest: ${isGuest})`
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
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
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
    console.log(
      `Adding composio query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the message in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: userInput,
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
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
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
    console.log(
      `Adding composio result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the result in the conversation for both guest and authenticated users
    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: result,
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
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<Object>} A promise that resolves to the updated conversation object with the new message.
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
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of message objects, or an empty array if the conversation is not found or an error occurs.
 */
const getComposioHistory = async (
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

    if (!conversation) {
      return [];
    }

    // Get last N messages for context
    const recentMessages = conversation.messages.slice(-limit).map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata,
    }));

    return recentMessages;
  } catch (error) {
    logger.error('Error getting composio history:', error);
    return [];
  }
};

/**
 * Updates the title of a Composio conversation based on the results of a workflow execution.
 * The title is dynamically generated to reflect the identified application, action, or workflow type.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {Object} workflowResult - An object containing details about the workflow execution,
 *                                  e.g., `{ identifiedApp, identifiedAction, workflowType }`.
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
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
      newTitle = `${identifiedAction}`;
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
 * @param {import('express').Request} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<Object>} A promise that resolves to an object containing Composio conversation statistics.
 *   - `totalComposioConversations`: The total count of Composio conversations.
 *   - `totalComposioMessages`: The total count of messages across all Composio conversations.
 *   - `averageMessagesPerConversation`: The average number of messages per Composio conversation.
 */
const getComposioStats = async (userId, req = null) => {
  try {
    const composioConversations =
      await conversationHelpers.getUserConversations(
        userId,
        { 'metadata.category': 'composio' },
        { limit: 1000 } // Assuming a reasonable limit for stats calculation
      );

    const totalComposio = composioConversations.conversations.length;
    const totalMessages = composioConversations.conversations.reduce(
      (sum, conv) => sum + conv.messageCount,
      0
    );

    return {
      totalComposioConversations: totalComposio,
      totalComposioMessages: totalMessages,
      averageMessagesPerConversation:
        totalComposio > 0 ? Math.round(totalMessages / totalComposio) : 0,
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