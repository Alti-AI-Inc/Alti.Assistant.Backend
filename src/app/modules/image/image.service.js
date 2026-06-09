/**
 * Image Assistant Service Module
 *
 * This service handles all image-related operations including:
 * - Managing image conversations and chat history
 * - Integration with the conversation system for persistent storage
 * - Image query processing and result handling
 * - User statistics and usage tracking
 * - Error handling and recovery
 *
 * Structure follows the same pattern as the search and code modules for consistency.
 *
 * @module ImageService
 */

import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';

// --- Indexing Recommendations for Conversation Model (assuming it's used by conversationHelpers/service) ---
// To optimize queries in conversationHelpers and conversationService, consider adding the following indexes
// to your Mongoose Conversation schema:
// 1. db.conversations.createIndex({ userId: 1 })
//    - Essential for `getUserConversations` and `getConversationById` to quickly find conversations by user.
// 2. db.conversations.createIndex({ _id: 1, userId: 1 })
//    - Composite index for `getConversationById` when both conversation ID and user ID are provided.
// 3. db.conversations.createIndex({ category: 1 })
//    - For filtering conversations by category, e.g., 'image'.
// 4. db.conversations.createIndex({ 'metadata.userType': 1 })
//    - For filtering guest vs. authenticated conversations, especially in `getGuestConversations`.
// 5. db.conversations.createIndex({ userId: 1, category: 1, 'metadata.userType': 1 })
//    - A more specific composite index for `getUserConversations` with multiple filters.
// 6. db.conversations.createIndex({ lastActivity: -1 })
//    - If conversations are frequently sorted by last activity.

/**
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  // Generate a proper MongoDB ObjectId for guest users
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique image conversation ID
 * @returns {string}
 */
const generateImageConversationId = () => {
  return `img-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create or get image conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} imageQuery
 * @param {boolean} isGuest
 * @param {Object} req
 * @returns {Promise<Object>}
 */
const handleImageConversation = async (
  userId,
  conversationId,
  imageQuery,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation for both authenticated and guest users
      try {
        // Prepare query options, assuming `req` can be extended with Mongoose query options
        const queryOptions = { ...req, lean: true }; // Use .lean() for read-only operations
        if (isGuest) {
          // For guest users, explicitly filter for guest conversations in the DB
          queryOptions['metadata.userType'] = 'guest';
        }

        // Always pass the actual userId for ownership verification.
        // The `isGuest ? null : userId` logic was potentially problematic for guest users
        // who still have a userId. The `metadata.userType` filter handles guest-specific access.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId, // Pass the actual userId (guest or authenticated)
          queryOptions
        );
        console.log(
          `Found existing conversation ${conversationId} for user ${userId}`
        );

        // The previous client-side check `if (isGuest && conversation.metadata?.userType !== 'guest')`
        // is now handled by the database query itself if `isGuest` is true and `metadata.userType` filter is applied.
        // If the conversation is found, it already matches the userType criteria.
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found or not matching criteria for user ${userId}, creating new one`
        );
        // If the error is due to the conversation not matching the guest type,
        // it will be caught here, leading to a new conversation. This is acceptable.
      }
    }
    console.log('Parameters for conversation:', {
      userId,
      conversationId,
      imageQuery,
      isGuest,
    });

    // Create conversation if it doesn't exist
    if (!conversation) {
      const newConversationId = conversationId || generateImageConversationId();

      if (isGuest) {
        // For guest users, create a conversation in the database but mark it as guest
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Image: ${imageQuery.substring(0, 50)}...`,
            metadata: {
              category: 'image',
              model: 'image-assistant',
              imageType: 'generation',
              userType: 'guest',
              isGuest: true,
            },
            is_image_assistant: true,
          },
          newConversationId,
          req
        );
      } else {
        // For authenticated users, use the full conversation service
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Image: ${imageQuery.substring(0, 50)}...`,
            metadata: {
              category: 'image',
              model: 'image-assistant',
              imageType: 'generation',
              userType: 'authenticated',
            },
            is_image_assistant: true,
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
    logger.error('Error handling image conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle image conversation'
    );
  }
};

/**
 * Add image query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} imageQuery
 * @param {boolean} isGuest
 * @param {Object} req
 * @returns {Promise<Object>}
 */
const addImageQueryMessage = async (
  conversationId,
  userId,
  imageQuery,
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding image query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // Store the message in the conversation for both guest and authenticated users
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: imageQuery,
        metadata: {
          messageType: 'image_query',
          timestamp: new Date().toISOString(),
        },
      },
      req
    );

    logger.info(
      `Added image query message to conversation ${conversationId} for ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
    );
    return message;
  } catch (error) {
    logger.error('Error adding image query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add image query message'
    );
  }
};

/**
 * Add image result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string|Object} imageResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @param {Object} req
 * @returns {Promise<Object>}
 */
const addImageResultMessage = async (
  conversationId,
  userId,
  imageResult,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    // Store the result in the conversation for both guest and authenticated users
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content:
          typeof imageResult === 'string'
            ? imageResult
            : JSON.stringify(imageResult),
        metadata: {
          messageType: 'image_result',
          timestamp: new Date().toISOString(),
          model: 'image-assistant',
          ...metadata,
        },
      },
      req
    );

    logger.info(
      `Added image result message to conversation ${conversationId} for ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
    );
    return message;
  } catch (error) {
    logger.error('Error adding image result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add image result message'
    );
  }
};

/**
 * Add error message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} errorMessage
 * @param {Error} error
 * @param {boolean} isGuest
 * @param {Object} req
 * @returns {Promise<Object>}
 */
const addErrorMessage = async (
  conversationId,
  userId,
  errorMessage,
  error,
  isGuest = false,
  req = null
) => {
  try {
    // Store the error in the conversation for both guest and authenticated users
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: errorMessage,
        metadata: {
          messageType: 'error',
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            stack:
              process.env.NODE_ENV === 'development' ? error.stack : undefined,
          },
        },
      },
      req
    );

    logger.info(
      `Added error message to conversation ${conversationId} for ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
    );
    return message;
  } catch (convError) {
    logger.error('Error adding error message to conversation:', convError);
    // Don't throw here to avoid recursive errors
    return null;
  }
};

/**
 * Get guest conversations for a specific guest user
 * @param {string} guestUserId
 * @param {Object} req
 * @returns {Promise<Array>}
 */
const getGuestConversations = async (guestUserId, req = null) => {
  try {
    // Push the 'metadata.userType' filter to the database query
    // and use .lean() for performance as documents are read-only.
    const conversations = await conversationHelpers.getUserConversations(
      guestUserId,
      {
        category: 'image',
        'metadata.userType': 'guest', // Filter by userType directly in the DB query
        limit: 100, // Limit guest conversations
      },
      { ...req, lean: true } // Pass req and add lean option
    );

    // No need for client-side filtering as it's handled by the DB query
    const guestConversations = conversations.conversations;

    logger.info(
      `Retrieved ${guestConversations.length} guest conversations for user ${guestUserId}`
    );
    return guestConversations;
  } catch (error) {
    logger.error('Error getting guest conversations:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve guest conversations'
    );
  }
};

/**
 * Get guest conversation by conversation ID
 * @param {string} conversationId
 * @param {string} guestUserId
 * @param {Object} req
 * @returns {Promise<Object>}
 */
const getGuestConversation = async (
  conversationId,
  guestUserId,
  req = null
) => {
  try {
    // Push the 'metadata.userType' filter to the database query
    // and use .lean() for performance as the document is read-only.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      guestUserId,
      { ...req, 'metadata.userType': 'guest', lean: true } // Add filter and lean option
    );

    // If conversation is found, it already matches the guest userType criteria due to the DB filter.
    if (conversation) {
      return conversation;
    }

    // If no conversation is found or it doesn't match the criteria, throw NOT_FOUND
    throw new ApiError(httpStatus.NOT_FOUND, 'Guest conversation not found');
  } catch (error) {
    logger.error('Error fetching guest conversation:', error);
    throw error;
  }
};

/**
 * Get image statistics for authenticated users
 * @param {string} userId
 * @param {Object} req
 * @returns {Promise<Object>}
 */
const getImageStats = async (userId, req = null) => {
  try {
    // Get conversation count for image category
    // Use .lean() for performance as documents are read-only.
    const imageConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        category: 'image',
        limit: 1000, // Get all for counting
      },
      { ...req, lean: true } // Pass req and add lean option
    );

    // Calculate total messages across all image conversations
    let totalMessages = 0;
    let totalImages = 0;

    for (const conversation of imageConversations.conversations) {
      totalMessages += conversation.messageCount || 0;
      // Count assistant messages as generated images (rough estimate)
      totalImages += Math.floor((conversation.messageCount || 0) / 2);
    }

    const stats = {
      totalConversations: imageConversations.totalCount,
      totalMessages,
      totalImages,
      averageMessagesPerConversation:
        imageConversations.totalCount > 0
          ? (totalMessages / imageConversations.totalCount).toFixed(2)
          : 0,
      lastActivity: imageConversations.conversations[0]?.lastActivity || null,
    };

    logger.info(`Retrieved image stats for user ${userId}:`, stats);
    return stats;
  } catch (error) {
    logger.error('Error getting image stats:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve image statistics'
    );
  }
};

/**
 * Validate image URL or base64 data
 * @param {string} imageData
 * @returns {Object}
 */
const validateImageData = (imageData) => {
  try {
    if (!imageData || typeof imageData !== 'string') {
      return {
        isValid: false,
        error: 'Image data must be a non-empty string',
      };
    }

    // Check if it's a URL
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      try {
        new URL(imageData);
        return {
          isValid: true,
          type: 'url',
        };
      } catch {
        return {
          isValid: false,
          error: 'Invalid image URL format',
        };
      }
    }

    // Check if it's base64 data
    if (imageData.startsWith('data:image/')) {
      const base64Pattern = /^data:image\/(png|jpeg|jpg|gif|bmp|webp);base64,/;
      if (base64Pattern.test(imageData)) {
        return {
          isValid: true,
          type: 'base64',
        };
      }
      return {
        isValid: false,
        error: 'Invalid base64 image format',
      };
    }

    return {
      isValid: false,
      error: 'Image data must be a valid URL or base64 encoded image',
    };
  } catch (error) {
    logger.error('Error validating image data:', error);
    return {
      isValid: false,
      error: 'Failed to validate image data',
    };
  }
};

export const imageService = {
  generateGuestUserId,
  generateImageConversationId,
  handleImageConversation,
  addImageQueryMessage,
  addImageResultMessage,
  addErrorMessage,
  getImageStats,
  getGuestConversation,
  getGuestConversations,
  validateImageData,
};