import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import { openMemoryClient } from '../../shared/openMemoryClient.js';
import { imagen3 } from './utils/imagegen2.5.service.js';
import { imagegen_4 } from './utils/imagegen4.service.js';
import { routeImageGenRequest } from './utils/intentClassifier.js';
import { analyzeImageIntent as analyzeIntent } from './utils/imageIntentAnalyzer.js';
import { editImageWithImagen3 } from './utils/imagen3.service.js';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../../../../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Create or get image conversation (supports both authenticated and guest users)
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} prompt
 * @param {boolean} isGuest
 * @param {string} category - 'image_generation' or 'image_editing'
 * @returns {Promise<Object>}
 */
const handleImageConversation = async (userId, conversationId, prompt, isGuest = false, category = 'image_generation', req = null) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId, req);

        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(`Guest user ${userId} trying to access non-guest conversation ${conversationId}`);
          conversation = null;
        }

      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found for user ${userId}, creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateImageConversationId();

      if (isGuest) {
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Image: ${prompt.substring(0, 50)}...`,
            metadata: {
              category,
              model: 'imagen',
              userType: 'guest',
              isGuest: true,
            },
          },
          newConversationId,
          req
        );
      } else {
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Image: ${prompt.substring(0, 50)}...`,
            metadata: {
              category,
              model: 'imagen',
              userType: 'authenticated',
            },
          },
          newConversationId,
          req
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
 * Add image request message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} prompt
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addImageRequestMessage = async (conversationId, userId, prompt, metadata = {}, isGuest = false, req = null) => {
  try {
    console.log(`Adding image request message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: prompt,
        metadata: {
          type: metadata.type || 'image_request',
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      }
    );

    if (openMemoryClient?.enabled && prompt && userId) {
      try {
        await openMemoryClient.addMemory({
          content: prompt,
          userId,
          tags: ['image', 'request'],
          metadata: {
            conversationId,
            type: metadata.type || 'image_request',
            timestamp: new Date().toISOString(),
            isGuest,
          },
          sector: 'episodic',
        });
      } catch (memoryError) {
        logger.warn('Failed to persist image request in OpenMemory', memoryError);
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding image request message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add image request to conversation');
  }
};

/**
 * Add image result message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} result
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addImageResultMessage = async (conversationId, userId, result, metadata = {}, isGuest = false, req = null) => {
  try {
    console.log(`Adding image result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

    const savedMessage = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: result,
        metadata: {
          type: 'image_result',
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      }
    );

    if (openMemoryClient?.enabled && result && userId) {
      try {
        await openMemoryClient.addMemory({
          content: result,
          userId,
          tags: ['image', 'result'],
          metadata: {
            conversationId,
            ...metadata,
            type: 'image_result',
            isGuest,
          },
          sector: 'semantic',
        });
      } catch (memoryError) {
        logger.warn('Failed to persist image result in OpenMemory', memoryError);
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding image result message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add image result to conversation');
  }
};

/**
 * Add error message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} errorMessage
 * @param {Error} originalError
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
 */
const addErrorMessage = async (conversationId, userId, errorMessage, originalError, isGuest = false, req = null) => {
  try {
    console.log(`Adding error message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`);

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
      }
    );
  } catch (error) {
    logger.error('Error adding error message:', error);
  }
};

/**
 * Generate image with prompt
 * @param {string} prompt
 * @param {string} filename
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const generateImage = async (prompt, filename, options = {
  referenceImage: null,
  aspectRatio: null,
  negativePrompt: null,
}) => {
  try {
    const apiKey = config.gemini_secret_key;
    const result = await routeImageGenRequest(prompt, { apiKey });

    const imagesDir = path.join(__dirname, '..', '..', '..', 'uploads', 'images');
    const filepath = path.join(imagesDir, filename);
    let publicUrl;

    if (result.service === "imagen4") {
      publicUrl = await imagegen_4(prompt, filepath);
    } else if (result.service === "gemini2.5flash") {
      publicUrl = await imagen3(prompt, options.referenceImage, filename);
    }

    return {
      filename,
      url: publicUrl,
      service: result.service,
      reasoning: result.reasoning,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.error('Error generating image:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to generate image');
  }
};

/**
 * Edit image with prompt and base64 image
 * @param {string} prompt
 * @param {string} imageBase64
 * @param {string} filename
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const editImage = async (prompt, imageBase64, filename, options = {}) => {
  try {
    const apiKey = config.gemini_secret_key;
    const imageResult = await editImageWithImagen3(prompt, imageBase64, filename, apiKey);

    return {
      filename,
      url: imageResult,
      service: 'imagen3',
    };
  } catch (error) {
    logger.error('Error editing image:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to edit image');
  }
};

/**
 * Analyze image intent
 * @param {string} prompt
 * @returns {Promise<Object>}
 */
const analyzeImageIntent = async (prompt) => {
  try {
    const apiKey = config.gemini_secret_key;
    const result = await analyzeIntent(prompt, false, "No previous context.", { apiKey });
    return result;
  } catch (error) {
    logger.error('Error analyzing image intent:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to analyze image intent');
  }
};

/**
 * Analyze image intent with context
 * @param {string} prompt
 * @param {boolean} hasImage
 * @param {string} context
 * @returns {Promise<Object>}
 */
const analyzeImageIntentWithContext = async (prompt, hasImage, context) => {
  try {
    const apiKey = config.gemini_secret_key;
    const { analyzeImageIntent: analyzeIntentFull } = await import('./utils/imageIntentAnalyzer.js');
    const result = await analyzeIntentFull(prompt, hasImage, context, { apiKey });
    return result;
  } catch (error) {
    logger.error('Error analyzing image intent with context:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to analyze image intent');
  }
};

/**
 * Evaluate prompt quality
 * @param {string} prompt
 * @param {string} history
 * @returns {Promise<Object>}
 */
const evaluatePromptQuality = async (prompt, history) => {
  try {
    const apiKey = config.gemini_secret_key;
    const { evaluatePromptQuality: evaluatePrompt } = await import('./utils/promptEvaluator.js');
    const result = await evaluatePrompt(prompt, history, { apiKey });
    return result;
  } catch (error) {
    logger.error('Error evaluating prompt quality:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to evaluate prompt quality');
  }
};

/**
 * Build enhanced prompt from conversation history
 * @param {Array} conversationHistory
 * @returns {Promise<string>}
 */
const buildEnhancedPromptFromHistory = async (conversationHistory) => {
  try {
    const apiKey = config.gemini_secret_key;
    const { buildEnhancedPrompt } = await import('./utils/promptEvaluator.js');
    const result = await buildEnhancedPrompt(conversationHistory, { apiKey });
    return result;
  } catch (error) {
    logger.error('Error building enhanced prompt:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to build enhanced prompt');
  }
};

/**
 * Generate unique conversation ID for images
 * @returns {string}
 */
const generateImageConversationId = () => {
  return `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get image conversation statistics
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getImageStats = async (userId, req = null) => {
  try {
    const imageConversations = await conversationHelpers.getUserConversations(userId, {
      page: 1,
      limit: 1000,
      category: 'image_generation',
    });

    const editConversations = await conversationHelpers.getUserConversations(userId, {
      page: 1,
      limit: 1000,
      category: 'image_editing',
    });

    const totalGenerations = imageConversations.conversations.length;
    const totalEdits = editConversations.conversations.length;
    const totalImages = totalGenerations + totalEdits;

    return {
      totalImageConversations: totalImages,
      totalGenerations,
      totalEdits,
      totalMessages: imageConversations.conversations.reduce((sum, conv) => sum + conv.messageCount, 0) +
        editConversations.conversations.reduce((sum, conv) => sum + conv.messageCount, 0),
    };
  } catch (error) {
    logger.error('Error getting image stats:', error);
    return {
      totalImageConversations: 0,
      totalGenerations: 0,
      totalEdits: 0,
      totalMessages: 0,
    };
  }
};

export const enhancedImageService = {
  handleImageConversation,
  addImageRequestMessage,
  addImageResultMessage,
  addErrorMessage,
  generateImage,
  editImage,
  analyzeImageIntent,
  analyzeImageIntentWithContext,
  evaluatePromptQuality,
  buildEnhancedPromptFromHistory,
  generateImageConversationId,
  generateGuestUserId,
  getImageStats,
};
