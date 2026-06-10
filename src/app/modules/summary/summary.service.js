import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { openMemoryClient } from '../../shared/openMemoryClient.js';
// INTEGRATION: Import usage service to enforce limits and track usage across the hierarchy.
import { usageService } from '../usage/usage.service.js';
// OPTIMIZATION: Import Conversation model for efficient aggregation queries.
import { Conversation } from '../conversations/conversation.model.js';

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
 * Supports both authenticated and guest users, enforcing tenant boundaries and usage limits.
 *
 * @param {string} userId - The ID of the user (authenticated or guest) initiating or accessing the conversation.
 * @param {string} [conversationId] - Optional. The ID of an existing conversation to retrieve.
 * @param {string} summaryQuery - The initial query or topic for the summary conversation, used for title generation.
 * @param {boolean} [isGuest=false] - True if the user is a guest; otherwise, false.
 * @param {object} req - The Express request object. Required for authenticated users to provide context (req.user).
 * @returns {Promise<object>} A promise that resolves to the conversation object (either existing or newly created).
 * @throws {ApiError} If there's an authorization failure, usage limit exceeded, or internal server error.
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
      // Try to get existing conversation.
      // CRITICAL: conversationHelpers.getConversationById must perform authorization checks.
      // It should use the `userId` and `req.user` context to ensure the user has permission
      // to access the conversation, respecting workspace and organization boundaries to prevent IDOR.
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        );

        // For guest users, verify the conversation is indeed a guest conversation.
        if (isGuest && conversation?.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null; // Force creation of new conversation
        }

        // INTEGRATION: For authenticated users, perform a secondary check to ensure the conversation belongs to their workspace.
        // The primary check should be in getConversationById, but this adds defense-in-depth.
        if (
          !isGuest &&
          req?.user &&
          conversation?.workspaceId.toString() !== req.user.workspaceId
        ) {
          logger.warn(
            `IDOR Attempt: User ${req.user._id} from workspace ${req.user.workspaceId} tried to access conversation ${conversationId} from another workspace ${conversation?.workspaceId}.`
          );
          throw new ApiError(httpStatus.FORBIDDEN, 'Access Denied');
        }
      } catch (error) {
        // If it's a specific authorization error, re-throw it. Otherwise, proceed to create a new one.
        if (error instanceof ApiError && error.statusCode === httpStatus.FORBIDDEN) {
          throw error;
        }
        logger.warn(
          `Conversation ${conversationId} not found or inaccessible for user ${userId}, creating new one. Error: ${error.message}`
        );
        conversation = null;
      }
    }

    // Create conversation if it doesn't exist or was not accessible
    if (!conversation) {
      if (!isGuest) {
        if (!req || !req.user) {
          throw new ApiError(
            httpStatus.UNAUTHORIZED,
            'Authentication required for this operation.'
          );
        }
        // INTEGRATION: Enforce usage limits. This prevents users or workspaces from exceeding their allocated resource quotas.
        await usageService.checkConversationLimit(req.user);
      }

      const title = `Summary: ${summaryQuery.substring(0, 50)}${summaryQuery.length > 50 ? '...' : ''}`;

      if (isGuest) {
        conversation = await conversationService.createConversation(
          {
            userId,
            title,
            metadata: {
              category: 'summary',
              model: 'summary-agent',
              summaryType: 'assistant',
              userType: 'guest',
              isGuest: true,
            },
          },
          req
        );
      } else {
        // INTEGRATION: Ensure authenticated user's request is handled within their tenant context.
        const { _id, workspaceId, organizationId, role } = req.user;

        // A regular user can only create conversations for themselves.
        if (role === 'user' && userId !== _id.toString()) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'Users can only create conversations for themselves.'
          );
        }

        conversation = await conversationService.createConversation(
          {
            userId,
            workspaceId,
            organizationId,
            title,
            metadata: {
              category: 'summary',
              model: 'summary-agent',
              summaryType: 'assistant',
              userType: 'authenticated',
            },
          },
          req
        );
        // INTEGRATION: Record the creation of a new conversation for usage tracking.
        // This data propagates up to the workspace/organization level for billing and monitoring.
        await usageService.recordNewConversation(req.user);
      }

      logger.info(
        `Created new conversation ${conversation._id} for user ${userId} (guest: ${isGuest})`
      );
    }

    return conversation;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error handling summary conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle summary conversation'
    );
  }
};

/**
 * Adds a user's summary query message to a specified conversation, enforcing usage limits.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user (authenticated or guest) sending the message.
 * @param {string} summaryQuery - The content of the user's summary query.
 * @param {boolean} [isGuest=false] - True if the user is a guest; otherwise, false.
 * @param {object} req - The Express request object. Required for authenticated users.
 * @returns {Promise<object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If usage limits are exceeded or another error occurs.
 */
const addSummaryQueryMessage = async (
  conversationId,
  userId,
  summaryQuery,
  isGuest = false,
  req = null
) => {
  try {
    // INTEGRATION: For authenticated users, check limits and permissions before adding a message.
    if (!isGuest) {
      if (!req || !req.user) {
        throw new ApiError(
          httpStatus.UNAUTHORIZED,
          'Authentication required for this operation.'
        );
      }
      // CRITICAL: This check prevents users from exceeding their plan's limits.
      await usageService.checkMessageLimit(req.user);
    }

    // CRITICAL: conversationService.addMessageToConversation must verify that the user (from req.user)
    // has write access to the conversation, respecting tenant boundaries.
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

    // INTEGRATION: Record the message for usage tracking and billing.
    if (!isGuest) {
      await usageService.recordMessage(req.user, conversationId, 'user');
    }

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
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error adding summary query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add summary query to conversation'
    );
  }
};

/**
 * Adds an assistant's summary result message to a specified conversation and records usage.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {string} summaryResult - The content of the assistant's summary result.
 * @param {object} [metadata={}] - Optional. Additional metadata (e.g., token counts).
 * @param {boolean} [isGuest=false] - True if the user is a guest; otherwise, false.
 * @param {object} req - The Express request object, providing user context for usage tracking.
 * @returns {Promise<object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If an internal server error occurs.
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
    // CRITICAL: The service must ensure this internal-facing operation cannot be triggered
    // by an external user. The `req` object should be from a trusted, authenticated context.
    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId, // The user associated with the conversation
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
      req // Pass request for context and authorization within the service
    );

    // INTEGRATION: Record the assistant message for usage tracking (e.g., token counting).
    if (!isGuest && req?.user) {
      await usageService.recordMessage(req.user, conversationId, 'assistant', {
        tokenCount: metadata.tokenCount || null, // Example of passing more detailed usage data
      });
    }

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
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error adding summary result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add summary result to conversation'
    );
  }
};

/**
 * Adds an error message from the assistant to a specified conversation.
 *
 * @param {string} conversationId - The ID of the conversation to add the error message to.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {string} errorMessage - The user-friendly error message content.
 * @param {Error} originalError - The original error object for detailed logging.
 * @param {boolean} [isGuest=false] - True if the user is a guest; otherwise, false.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<object | void>} A promise that resolves to the saved message object, or void on failure.
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
    logger.error(
      `Critical failure: Could not add an error message to conversation ${conversationId}.`,
      error
    );
    // Don't throw here to avoid cascading errors during an already-failed operation.
  }
};

/**
 * Retrieves a limited history of messages for a given summary conversation.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve history from.
 * @param {string} userId - The ID of the user (authenticated or guest) associated with the conversation.
 * @param {boolean} [isGuest=false] - Flag to handle guest vs authenticated user context correctly.
 * @param {number} [limit=10] - The maximum number of recent messages to retrieve.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of formatted message objects.
 */
const getSummaryHistory = async (
  conversationId,
  userId,
  isGuest = false,
  limit = 10,
  req = null
) => {
  try {
    // CRITICAL: conversationHelpers.getConversationById must perform authorization.
    // It should use the provided `userId` and the `req` object (containing `req.user` for authenticated sessions)
    // to verify that the caller has permission to read the conversation. This prevents IDOR.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation) {
      return [];
    }

    // SECURITY (DEFENSE-IN-DEPTH): Ensure a guest user cannot accidentally be served a non-guest conversation history.
    // The primary authorization is in getConversationById, but this adds an extra layer of data isolation.
    if (isGuest && conversation.metadata?.userType !== 'guest') {
      logger.warn(
        `Guest user ${userId} was blocked from accessing non-guest conversation history for ${conversationId}`
      );
      return [];
    }

    if (!conversation.messages) {
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
    return []; // Return empty array on failure to prevent breaking the client
  }
};

/**
 * Updates the title of a summary conversation.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user (authenticated or guest) who owns the conversation.
 * @param {string} summaryQuery - The query string used to generate the new title.
 * @param {object} [req=null] - The Express request object.
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
    // CRITICAL: conversationService.updateConversationTitle must verify ownership/permissions
    // using userId and req.user before performing the update to prevent unauthorized modifications.
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
 * Retrieves statistics related to a user's summary conversations using an efficient aggregation pipeline.
 *
 * @param {string} userId - The ID of the user for whom to retrieve statistics.
 * @param {object} req - The Express request object, required for authorization.
 * @returns {Promise<object>} A promise that resolves to an object containing summary statistics.
 * @throws {ApiError} If the user is not authorized.
 */
const getSummaryStats = async (userId, req = null) => {
  try {
    // CRITICAL: Enforce authorization. A regular user can only see their own stats.
    if (
      !req ||
      !req.user ||
      (req.user.role === 'user' && req.user._id.toString() !== userId)
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You are not authorized to view these statistics.'
      );
    }

    // OPTIMIZATION: Use a MongoDB aggregation pipeline to calculate stats efficiently
    // in the database, avoiding fetching large amounts of data into the application memory.
    // This is scalable, fast, and provides accurate results regardless of the number of conversations.

    // 1. Build the initial match stage for authorization and filtering.
    const matchStage = {
      'metadata.category': 'summary',
      // Apply authorization based on user role to ensure data isolation.
      // This logic should mirror the permissions in `getUserConversations`.
      ...(req.user.role === 'user' && {
        userId: new mongoose.Types.ObjectId(userId),
      }),
      ...(req.user.role === 'manager' && {
        workspaceId: new mongoose.Types.ObjectId(req.user.workspaceId),
      }),
      ...(req.user.role === 'admin' && {
        organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
      }),
    };

    // 2. Define the aggregation pipeline.
    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null, // Group all matching documents into a single result.
          totalSummaryConversations: { $sum: 1 }, // Count the number of conversations.
          totalSummaryMessages: { $sum: '$messageCount' }, // Sum the messageCount from each conversation.
        },
      },
      {
        $project: {
          _id: 0, // Exclude the _id field from the final output.
          totalSummaryConversations: 1,
          totalSummaryMessages: 1,
          averageMessagesPerConversation: {
            // Safely calculate the average, avoiding division by zero.
            $cond: [
              { $eq: ['$totalSummaryConversations', 0] },
              0,
              { $round: [{ $divide: ['$totalSummaryMessages', '$totalSummaryConversations'] }] },
            ],
          },
        },
      },
    ];

    // 3. Execute the aggregation query.
    const statsResult = await Conversation.aggregate(pipeline);

    // 4. Return the calculated stats or default zero values if no conversations were found.
    if (statsResult.length > 0) {
      return statsResult[0];
    }

    return {
      totalSummaryConversations: 0,
      totalSummaryMessages: 0,
      averageMessagesPerConversation: 0,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error getting summary stats:', error);
    // Return a default object on unexpected errors to prevent client-side crashes.
    return {
      totalSummaryConversations: 0,
      totalSummaryMessages: 0,
      averageMessagesPerConversation: 0,
    };
  }
};

/**
 * @typedef {object} SummaryService
 * @property {function(string, string, string, boolean, object): Promise<object>} handleSummaryConversation
 * @property {function(string, string, string, boolean, object): Promise<object>} addSummaryQueryMessage
 * @property {function(string, string, string, object, boolean, object): Promise<object>} addSummaryResultMessage
 * @property {function(string, string, string, Error, boolean, object): Promise<object | void>} addErrorMessage
 * @property {function(string, string, boolean, number, object): Promise<Array<object>>} getSummaryHistory
 * @property {function(string, string, string, object): Promise<void>} updateConversationTitle
 * @property {function(): string} generateGuestUserId
 * @property {function(string, object): Promise<object>} getSummaryStats
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
  generateGuestUserId,
  getSummaryStats,
};