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
 * Generates a unique ID for a guest user.
 * @returns {string} A unique guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique ID for an image-related conversation.
 * @returns {string} A unique conversation ID, prefixed with "image-".
 */
// BUG FIX: Moved this function definition before its first use in handleImageConversation
const generateImageConversationId = () => {
  return `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Finds an existing image conversation or creates a new one.
 * This function supports both authenticated and guest users.
 * @param {string} userId - The ID of the user (can be a guest ID).
 * @param {string|null} conversationId - The ID of an existing conversation. If null or not found, a new one is created.
 * @param {string} prompt - The user's initial prompt, used to generate a title for new conversations.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {('image_generation'|'image_editing')} [category='image_generation'] - The category of the conversation.
 * @param {import('express').Request | null} [req=null] - The Express request object, for context.
 * @returns {Promise<object>} A promise that resolves to the conversation object.
 * @throws {ApiError} If there's a server error while handling the conversation.
 */
const handleImageConversation = async (
  userId,
  conversationId,
  prompt,
  isGuest = false,
  category = 'image_generation',
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        // Optimization: Use .lean() for read-only query to improve performance.
        // The fetched conversation is only read from, not modified as a Mongoose document.
        // Assuming conversationHelpers.getConversationById accepts a 'lean' flag as the last argument.
        // Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Conversation model
        // for efficient lookups. A compound index on { conversationId: 1, userId: 1 } might be beneficial.
        // BUG FIX: Changed 'isGuest ? null : userId' to 'userId'.
        // The 'userId' parameter should always contain the actual user ID (guest ID for guest users).
        // The 'getConversationById' function should internally handle validation based on 'userId' and 'isGuest' status
        // to prevent IDOR vulnerabilities where a guest user might access a non-guest conversation.
        // The subsequent check 'if (isGuest && conversation.metadata?.userType !== 'guest')'
        // provides an additional layer of security after fetching.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId, // Pass the actual userId, whether guest or authenticated
          req,
          true // Enable lean mode
        );

        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null;
        }
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found for user ${userId}, creating new one`
        );
      }
    }

    if (!conversation) {
      // BUG FIX: generateImageConversationId is now defined earlier.
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
 * Adds a user's image request message to a conversation and logs it to OpenMemory if enabled.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user.
 * @param {string} prompt - The user's prompt/message content.
 * @param {object} [metadata={}] - Additional metadata to store with the message.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {import('express').Request | null} [req=null] - The Express request object, for context.
 * @returns {Promise<object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If adding the message fails.
 */
const addImageRequestMessage = async (
  conversationId,
  userId,
  prompt,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding image request message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // BUG FIX: Pass 'req' to conversationService.addMessageToConversation for consistency
    // and if the underlying service requires it for context/logging.
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
      },
      req
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
        logger.warn(
          'Failed to persist image request in OpenMemory',
          memoryError
        );
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding image request message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add image request to conversation'
    );
  }
};

/**
 * Adds an assistant's image result message to a conversation and logs it to OpenMemory if enabled.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} result - The content of the result message (e.g., URL to the image).
 * @param {object} [metadata={}] - Additional metadata about the generated image (e.g., service used).
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {import('express').Request | null} [req=null] - The Express request object, for context.
 * @returns {Promise<object>} A promise that resolves to the saved message object.
 * @throws {ApiError} If adding the message fails.
 */
const addImageResultMessage = async (
  conversationId,
  userId,
  result,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    console.log(
      `Adding image result message to conversation ${conversationId} for user ${userId} (guest: ${isGuest})`
    );

    // BUG FIX: Pass 'req' to conversationService.addMessageToConversation for consistency
    // and if the underlying service requires it for context/logging.
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
      },
      req
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
        logger.warn(
          'Failed to persist image result in OpenMemory',
          memoryError
        );
      }
    }

    return savedMessage;
  } catch (error) {
    logger.error('Error adding image result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add image result to conversation'
    );
  }
};

/**
 * Adds an error message to a conversation when an operation fails.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user.
 * @param {string} errorMessage - The user-facing error message.
 * @param {Error} originalError - The original error object for logging.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {import('express').Request | null} [req=null] - The Express request object, for context.
 * @returns {Promise<object|undefined>} A promise that resolves to the saved message object, or undefined if saving fails.
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

    // BUG FIX: Pass 'req' to conversationService.addMessageToConversation for consistency
    // and if the underlying service requires it for context/logging.
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
  }
};

/**
 * Generates an image based on a prompt. It routes the request to the most suitable image generation service and saves the result.
 * @param {string} prompt - The text prompt describing the image to generate.
 * @param {string} filename - The desired filename for the output image.
 * @param {object} [options={}] - Optional parameters for image generation.
 * @param {string|null} [options.referenceImage] - A reference image for the generation process.
 * @param {string|null} [options.aspectRatio] - The desired aspect ratio (e.g., "16:9").
 * @param {string|null} [options.negativePrompt] - A prompt describing what to avoid in the image.
 * @returns {Promise<object>} A promise that resolves to an object containing the filename, public URL, and metadata about the generation service.
 * @throws {ApiError} If image generation fails.
 */
const generateImage = async (
  prompt,
  filename,
  options = {
    referenceImage: null,
    aspectRatio: null,
    negativePrompt: null,
  }
) => {
  try {
    // SECURITY FIX: Sanitize filename to prevent path traversal vulnerabilities.
    // This ensures that 'filename' does not contain directory separators (e.g., '..')
    // which could allow an attacker to write files outside the intended 'uploads/images' directory.
    const safeFilename = path.basename(filename);

    const apiKey = config.gemini_secret_key;
    const result = await routeImageGenRequest(prompt, { apiKey });

    const imagesDir = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'uploads',
      'images'
    );
    // Use the sanitized filename for path construction.
    const filepath = path.join(imagesDir, safeFilename);
    let publicUrl;

    if (result.service === 'imagen4') {
      publicUrl = await imagegen_4(prompt, filepath);
    } else if (result.service === 'gemini2.5flash') {
      // Pass the sanitized filename to imagen3 if it expects a simple filename.
      publicUrl = await imagen3(prompt, options.referenceImage, safeFilename);
    }

    return {
      filename: safeFilename, // Return the sanitized filename
      url: publicUrl,
      service: result.service,
      reasoning: result.reasoning,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.error('Error generating image:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate image'
    );
  }
};

/**
 * Edits an existing image based on a text prompt using an inpainting/outpainting model.
 * @param {string} prompt - The text prompt describing the edits.
 * @param {string} imageBase64 - The base64 encoded string of the image to edit.
 * @param {string} filename - The desired filename for the output image.
 * @param {object} [options={}] - Optional parameters for the editing process.
 * @returns {Promise<object>} A promise that resolves to an object containing the filename, public URL, and service metadata.
 * @throws {ApiError} If image editing fails.
 */
const editImage = async (prompt, imageBase64, filename, options = {}) => {
  try {
    // SECURITY FIX: Sanitize filename to prevent path traversal vulnerabilities.
    // This ensures that 'filename' does not contain directory separators (e.g., '..')
    // which could allow an attacker to write files outside the intended directory.
    const safeFilename = path.basename(filename);

    const apiKey = config.gemini_secret_key;
    // Pass the sanitized filename to editImageWithImagen3.
    const imageResult = await editImageWithImagen3(
      prompt,
      imageBase64,
      safeFilename,
      apiKey
    );

    return {
      filename: safeFilename, // Return the sanitized filename
      url: imageResult,
      service: 'imagen3',
    };
  } catch (error) {
    logger.error('Error editing image:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to edit image'
    );
  }
};

/**
 * Analyzes a user's prompt to determine the intent related to image generation or editing.
 * @param {string} prompt - The user's prompt.
 * @returns {Promise<object>} A promise that resolves to the intent analysis result.
 * @throws {ApiError} If intent analysis fails.
 */
const analyzeImageIntent = async (prompt) => {
  try {
    const apiKey = config.gemini_secret_key;
    const result = await analyzeIntent(prompt, false, 'No previous context.', {
      apiKey,
    });
    return result;
  } catch (error) {
    logger.error('Error analyzing image intent:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to analyze image intent'
    );
  }
};

/**
 * Analyzes a user's prompt with additional context from the conversation to determine intent.
 * @param {string} prompt - The user's prompt.
 * @param {boolean} hasImage - Whether the current context includes an image.
 * @param {string} context - The preceding conversation history or context.
 * @returns {Promise<object>} A promise that resolves to the intent analysis result.
 * @throws {ApiError} If intent analysis fails.
 */
const analyzeImageIntentWithContext = async (prompt, hasImage, context) => {
  try {
    const apiKey = config.gemini_secret_key;
    const { analyzeImageIntent: analyzeIntentFull } = await import(
      './utils/imageIntentAnalyzer.js'
    );
    const result = await analyzeIntentFull(prompt, hasImage, context, {
      apiKey,
    });
    return result;
  } catch (error) {
    logger.error('Error analyzing image intent with context:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to analyze image intent'
    );
  }
};

/**
 * Evaluates the quality and clarity of a user's prompt for image generation.
 * @param {string} prompt - The user's prompt to evaluate.
 * @param {string} history - The conversation history for context.
 * @returns {Promise<object>} A promise that resolves to the evaluation result.
 * @throws {ApiError} If prompt evaluation fails.
 */
const evaluatePromptQuality = async (prompt, history) => {
  try {
    const apiKey = config.gemini_secret_key;
    const { evaluatePromptQuality: evaluatePrompt } = await import(
      './utils/promptEvaluator.js'
    );
    const result = await evaluatePrompt(prompt, history, { apiKey });
    return result;
  } catch (error) {
    logger.error('Error evaluating prompt quality:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to evaluate prompt quality'
    );
  }
};

/**
 * Constructs an enhanced, more detailed prompt for image generation by synthesizing information from the conversation history.
 * @param {Array<object>} conversationHistory - An array of message objects from the conversation.
 * @returns {Promise<string>} A promise that resolves to the enhanced prompt string.
 * @throws {ApiError} If prompt enhancement fails.
 */
const buildEnhancedPromptFromHistory = async (conversationHistory) => {
  try {
    const apiKey = config.gemini_secret_key;
    const { buildEnhancedPrompt } = await import('./utils/promptEvaluator.js');
    const result = await buildEnhancedPrompt(conversationHistory, { apiKey });
    return result;
  } catch (error) {
    logger.error('Error building enhanced prompt:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to build enhanced prompt'
    );
  }
};

/**
 * Retrieves statistics about a user's image generation and editing activities.
 * @permission This service is intended for authenticated users to retrieve their own stats. Access control should be enforced by the caller.
 * @param {string} userId - The ID of the user whose stats are being requested.
 * @param {import('express').Request | null} [req=null] - The Express request object, for context.
 * @returns {Promise<object>} A promise that resolves to an object containing image-related statistics.
 */
const getImageStats = async (userId, req = null) => {
  try {
    // Optimization: Use .lean() for read-only queries to improve performance.
    // The fetched conversations are only used for aggregation (length, messageCount),
    // not modified as Mongoose documents.
    // Assuming conversationHelpers.getUserConversations accepts a 'lean' flag as the last argument.
    // Recommendation: Ensure 'userId' and 'metadata.category' fields are indexed in the Conversation model
    // for efficient lookups. A compound index on { userId: 1, 'metadata.category': 1 } would be highly beneficial.
    const imageConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        page: 1,
        limit: 1000,
        category: 'image_generation',
      },
      true // Enable lean mode
    );

    const editConversations = await conversationHelpers.getUserConversations(
      userId,
      {
        page: 1,
        limit: 1000,
        category: 'image_editing',
      },
      true // Enable lean mode
    );

    const totalGenerations = imageConversations.conversations.length;
    const totalEdits = editConversations.conversations.length;
    const totalImages = totalGenerations + totalEdits;

    return {
      totalImageConversations: totalImages,
      totalGenerations,
      totalEdits,
      totalMessages:
        imageConversations.conversations.reduce(
          (sum, conv) => sum + conv.messageCount,
          0
        ) +
        editConversations.conversations.reduce(
          (sum, conv) => sum + conv.messageCount,
          0
        ),
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

/**
 * A service object that encapsulates all functionalities related to enhanced image generation, editing, and conversation management.
 * @namespace enhancedImageService
 */
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