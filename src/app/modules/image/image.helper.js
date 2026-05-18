import { logger } from '../../../shared/logger.js';
import { IMAGE_ASSISTANT_CONSTANTS } from './image.constant.js';

/**
 * Format image generation response for client
 * @param {string} response
 * @param {Array|Object} imageData
 * @param {string} conversationId
 * @param {number} messageCount
 * @returns {Object}
 */
export const formatImageResponse = (
  response,
  imageData,
  conversationId,
  messageCount
) => {
  try {
    return {
      responseMessage: {
        text: response,
        images: imageData || [],
        type: 'generation',
      },
      conversationId,
      messageCount,
    };
  } catch (error) {
    logger.warn('Failed to format image response:', error);
    return {
      responseMessage: {
        text: response,
        images: [],
        type: 'generation',
      },
      conversationId,
      messageCount,
    };
  }
};

/**
 * Format image analysis response for client
 * @param {string} response
 * @param {string} conversationId
 * @param {number} messageCount
 * @returns {Object}
 */
export const formatAnalysisResponse = (
  response,
  conversationId,
  messageCount
) => {
  try {
    return {
      responseMessage: {
        text: response,
        type: 'analysis',
      },
      conversationId,
      messageCount,
    };
  } catch (error) {
    logger.warn('Failed to format analysis response:', error);
    return {
      responseMessage: {
        text: response,
        type: 'analysis',
      },
      conversationId,
      messageCount,
    };
  }
};

/**
 * Validate image query length and content
 * @param {string} message
 * @returns {Object}
 */
export const validateImageQuery = (message) => {
  if (!message || typeof message !== 'string') {
    return {
      isValid: false,
      error: 'Image query must be a non-empty string',
    };
  }

  if (message.length > IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH) {
    return {
      isValid: false,
      error: `Image query too long. Maximum ${IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH} characters allowed`,
    };
  }

  if (message.length < IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH) {
    return {
      isValid: false,
      error: `Image query too short. Minimum ${IMAGE_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH} characters required`,
    };
  }

  return {
    isValid: true,
  };
};

/**
 * Format error message for user consumption
 * @param {Error} error
 * @param {string} originalQuery
 * @returns {string}
 */
export const formatErrorMessage = (error, originalQuery) => {
  const baseMessage =
    'I apologize, but I encountered an error while processing your image request.';

  // Don't expose internal error details to users
  if (
    error.message?.includes('rate limit') ||
    error.message?.includes('quota')
  ) {
    return `${baseMessage} It seems we've reached our service limits. Please try again in a few minutes.`;
  }

  if (error.message?.includes('invalid') || error.message?.includes('format')) {
    return `${baseMessage} Please check your image format or prompt and try again.`;
  }

  if (
    error.message?.includes('network') ||
    error.message?.includes('timeout')
  ) {
    return `${baseMessage} There seems to be a connectivity issue. Please try again.`;
  }

  return `${baseMessage} Please try rephrasing your request or try again later.`;
};

/**
 * Extract image specifications from user query
 * @param {string} query
 * @returns {Object}
 */
export const extractImageSpecs = (query) => {
  const specs = {
    size: 'standard',
    style: 'realistic',
    aspectRatio: '1:1',
    quality: 'standard',
  };

  const lowerQuery = query.toLowerCase();

  // Extract size preferences
  if (
    lowerQuery.includes('large') ||
    lowerQuery.includes('big') ||
    lowerQuery.includes('1024')
  ) {
    specs.size = 'large';
  } else if (
    lowerQuery.includes('small') ||
    lowerQuery.includes('tiny') ||
    lowerQuery.includes('512')
  ) {
    specs.size = 'small';
  }

  // Extract style preferences
  if (
    lowerQuery.includes('cartoon') ||
    lowerQuery.includes('anime') ||
    lowerQuery.includes('comic')
  ) {
    specs.style = 'cartoon';
  } else if (
    lowerQuery.includes('abstract') ||
    lowerQuery.includes('artistic')
  ) {
    specs.style = 'abstract';
  } else if (
    lowerQuery.includes('photorealistic') ||
    lowerQuery.includes('photo')
  ) {
    specs.style = 'photorealistic';
  }

  // Extract aspect ratio
  if (lowerQuery.includes('portrait') || lowerQuery.includes('vertical')) {
    specs.aspectRatio = '3:4';
  } else if (
    lowerQuery.includes('landscape') ||
    lowerQuery.includes('horizontal') ||
    lowerQuery.includes('wide')
  ) {
    specs.aspectRatio = '4:3';
  }

  // Extract quality preferences
  if (
    lowerQuery.includes('high quality') ||
    lowerQuery.includes('detailed') ||
    lowerQuery.includes('hd')
  ) {
    specs.quality = 'high';
  }

  return specs;
};

/**
 * Generate conversation title from image query
 * @param {string} query
 * @param {string} type - 'generation' or 'analysis'
 * @returns {string}
 */
export const generateConversationTitle = (query, type = 'generation') => {
  const prefix = type === 'generation' ? 'Generate' : 'Analyze';
  const maxLength = 50;

  if (query.length <= maxLength) {
    return `${prefix}: ${query}`;
  }

  return `${prefix}: ${query.substring(0, maxLength - 3)}...`;
};

/**
 * Validate image preferences
 * @param {Object} preferences
 * @returns {Object}
 */
export const validateImagePreferences = (preferences = {}) => {
  const validSizes = ['small', 'standard', 'large'];
  const validStyles = ['realistic', 'cartoon', 'abstract', 'photorealistic'];
  const validAspectRatios = ['1:1', '3:4', '4:3', '16:9'];

  const validated = {
    size: validSizes.includes(preferences.size) ? preferences.size : 'standard',
    style: validStyles.includes(preferences.style)
      ? preferences.style
      : 'realistic',
    aspectRatio: validAspectRatios.includes(preferences.aspectRatio)
      ? preferences.aspectRatio
      : '1:1',
    quality: ['standard', 'high'].includes(preferences.quality)
      ? preferences.quality
      : 'standard',
  };

  return validated;
};

/**
 * Get suggested prompts based on user input
 * @param {string} userInput
 * @returns {Array<string>}
 */
export const getSuggestedPrompts = (userInput) => {
  const suggestions = [];
  const lowerInput = userInput.toLowerCase();

  if (lowerInput.includes('logo')) {
    suggestions.push(
      'Create a minimalist logo design',
      'Design a modern company logo',
      'Generate a vintage style logo'
    );
  } else if (lowerInput.includes('landscape')) {
    suggestions.push(
      'Create a fantasy landscape',
      'Generate a peaceful mountain scene',
      'Design a futuristic cityscape'
    );
  } else if (lowerInput.includes('portrait')) {
    suggestions.push(
      'Create a professional headshot',
      'Generate a fantasy character portrait',
      'Design an artistic self-portrait style'
    );
  } else {
    // Generic suggestions
    suggestions.push(
      'Make the image more detailed',
      'Change the color scheme to blue tones',
      'Add more lighting effects',
      'Create a different style variation'
    );
  }

  return suggestions.slice(0, 3); // Return max 3 suggestions
};

export const imageHelpers = {
  formatImageResponse,
  formatAnalysisResponse,
  validateImageQuery,
  formatErrorMessage,
  extractImageSpecs,
  generateConversationTitle,
  validateImagePreferences,
  getSuggestedPrompts,
};
