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
 * @returns {Promise<Object>}
 */
const handleImageConversation = async (userId, conversationId, imageQuery, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      // Try to get existing conversation for both authenticated and guest users
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);
        console.log(`Found existing conversation ${conversationId} for user ${userId}`);
        
        // For guest users, verify the conversation belongs to them or is a guest conversation
        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(`Guest user ${userId} trying to access non-guest conversation ${conversationId}`);
          conversation = null; // Force creation of new conversation
        }
        
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found for user ${userId}, creating new one`);
      }
    }
    console.log('Parameters for conversation:', { userId, conversationId, imageQuery, isGuest });
    
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
          newConversationId
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
          newConversationId
        );
      }
      
      console.log(`Created new conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling image conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle image conversation');
  }
};

/**
 * Add image query message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} imageQuery
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addImageQueryMessage = async (conversationId, userId, imageQuery, isGuest = false) => {
  try {

    console.log(`Adding image query message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);
    
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
      }
    );

    logger.info(`Added image query message to conversation ${conversationId} for ${isGuest ? 'guest' : 'authenticated'} user ${userId}`);
    return message;
  } catch (error) {
    logger.error('Error adding image query message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add image query message');
  }
};

/**
 * Add image result message to conversation (supports both authenticated and guest users)
 * @param {string} conversationId
 * @param {string} userId
 * @param {string|Object} imageResult
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addImageResultMessage = async (conversationId, userId, imageResult, metadata = {}, isGuest = false) => {
  try {
    // Store the result in the conversation for both guest and authenticated users
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: typeof imageResult === 'string' ? imageResult : JSON.stringify(imageResult),
        metadata: {
          messageType: 'image_result',
          timestamp: new Date().toISOString(),
          model: 'image-assistant',
          ...metadata,
        },
      }
    );

    logger.info(`Added image result message to conversation ${conversationId} for ${isGuest ? 'guest' : 'authenticated'} user ${userId}`);
    return message;
  } catch (error) {
    logger.error('Error adding image result message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add image result message');
  }
};

/**
 * Add error message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} errorMessage
 * @param {Error} error
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addErrorMessage = async (conversationId, userId, errorMessage, error, isGuest = false) => {
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
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          },
        },
      }
    );

    logger.info(`Added error message to conversation ${conversationId} for ${isGuest ? 'guest' : 'authenticated'} user ${userId}`);
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
 * @returns {Promise<Array>}
 */
const getGuestConversations = async (guestUserId) => {
  try {
    const conversations = await conversationHelpers.getUserConversations(guestUserId, {
      category: 'image',
      limit: 100, // Limit guest conversations
    });

    // Filter to only return guest conversations
    const guestConversations = conversations.conversations.filter(
      conv => conv.metadata?.userType === 'guest'
    );

    logger.info(`Retrieved ${guestConversations.length} guest conversations for user ${guestUserId}`);
    return guestConversations;
  } catch (error) {
    logger.error('Error getting guest conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve guest conversations');
  }
};

/**
 * Get guest conversation by conversation ID
 * @param {string} conversationId
 * @param {string} guestUserId
 * @returns {Promise<Object>}
 */
const getGuestConversation = async (conversationId, guestUserId) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId);
    
    // Verify it's a guest conversation
    if (conversation && conversation.metadata?.userType === 'guest') {
      return conversation;
    }
    
    throw new ApiError(httpStatus.NOT_FOUND, 'Guest conversation not found');
  } catch (error) {
    logger.error('Error fetching guest conversation:', error);
    throw error;
  }
};

/**
 * Get image statistics for authenticated users
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getImageStats = async (userId) => {
  try {
    // Get conversation count for image category
    const imageConversations = await conversationHelpers.getUserConversations(userId, {
      category: 'image',
      limit: 1000, // Get all for counting
    });

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
      averageMessagesPerConversation: imageConversations.totalCount > 0 
        ? (totalMessages / imageConversations.totalCount).toFixed(2)
        : 0,
      lastActivity: imageConversations.conversations[0]?.lastActivity || null,
    };

    logger.info(`Retrieved image stats for user ${userId}:`, stats);
    return stats;
  } catch (error) {
    logger.error('Error getting image stats:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve image statistics');
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
