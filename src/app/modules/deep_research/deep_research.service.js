import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';

/**
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique conversation ID for deep research
 * @returns {string}
 */
const generateDeepResearchConversationId = () => {
  return `dr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create or get deep research conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} researchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
            if (conversation.userId !== userId || conversation.metadata?.userType !== 'guest') {
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
 * Add deep research query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} researchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Add deep research result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} researchResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
    logger.error('Error adding error message:', error);
    // Don't throw here to avoid cascading errors
  }
};

/**
 * Process deep research history for context
 * @param {string} conversationId
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
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
 * Update conversation title based on research query
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} researchQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Get deep research statistics for the user
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getDeepResearchStats = async (userId, req = null) => {
  try {
    // Get all deep research conversations for the user.
    // PERFORMANCE/BUG FIX: Changed limit from 1000 to 0 (or a very large number)
    // assuming conversationHelpers.getUserConversations supports fetching all
    // when limit is 0 or not provided, for accurate statistics.
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
    const deepResearchConversations = deepResearchConversationsResult?.conversations || [];

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