import { logger } from '../../../shared/logger.js';
import { IMAGE_ASSISTANT_CONSTANTS } from './image.constant.js';

/**
 * @typedef {Object} ImageResponse
 * @property {Object} responseMessage - The message object containing the response text and images.
 * @property {string} responseMessage.text - The main text response to the user.
 * @property {Array<Object>} responseMessage.images - An array of image data objects, or an empty array if none.
 * @property {string} responseMessage.type - The type of response, e.g., 'generation'.
 * @property {string} conversationId - The ID of the current conversation.
 * @property {number} messageCount - The total number of messages in the conversation.
 */

/**
 * Formats the image generation response into a structured object suitable for client consumption.
 * This includes the generated text, image data, conversation ID, and message count.
 *
 * @param {string} response - The primary text response from the image generation service.
 * @param {Array<Object>|Object} imageData - An array of image data objects (e.g., URLs, metadata) or a single object.
 * @param {string} conversationId - The unique identifier for the current conversation.
 * @param {number} messageCount - The sequential count of messages within the conversation.
 * @returns {ImageResponse} A formatted object containing the response message, conversation ID, and message count.
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
    // Fallback in case of formatting error, ensuring a consistent structure
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
 * @typedef {Object} AnalysisResponse
 * @property {Object} responseMessage - The message object containing the response text.
 * @property {string} responseMessage.text - The main text response from the image analysis service.
 * @property {string} responseMessage.type - The type of response, e.g., 'analysis'.
 * @property {string} conversationId - The ID of the current conversation.
 * @property {number} messageCount - The total number of messages in the conversation.
 */

/**
 * Formats the image analysis response into a structured object suitable for client consumption.
 * This includes the analysis text, conversation ID, and message count.
 *
 * @param {string} response - The primary text response from the image analysis service.
 * @param {string} conversationId - The unique identifier for the current conversation.
 * @param {number} messageCount - The sequential count of messages within the conversation.
 * @returns {AnalysisResponse} A formatted object containing the response message, conversation ID, and message count.
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
    // Fallback in case of formatting error, ensuring a consistent structure
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
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - True if the message passes all validation checks, false otherwise.
 * @property {string} [error] - An error message if validation fails, otherwise undefined.
 */

/**
 * Validates the length and type of an image generation or analysis query message.
 * Ensures the message is a non-empty string and falls within predefined min/max length limits.
 *
 * @param {string} message - The user's query string for image generation or analysis.
 * @returns {ValidationResult} An object indicating whether the query is valid and an error message if not.
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
 * Formats an error message into a user-friendly string, abstracting internal error details.
 * It provides specific messages for common issues like rate limits, invalid formats, or network problems.
 *
 * @param {Error} error - The error object encountered during image processing.
 * @param {string} originalQuery - The original query string that led to the error (currently unused but kept for context).
 * @returns {string} A user-friendly error message.
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
 * @typedef {Object} ImageSpecs
 * @property {('small'|'standard'|'large')} size - The desired size of the image (e.g., 'standard', 'large'). Defaults to 'standard'.
 * @property {('realistic'|'cartoon'|'abstract'|'photorealistic')} style - The artistic style of the image (e.g., 'realistic', 'cartoon'). Defaults to 'realistic'.
 * @property {('1:1'|'3:4'|'4:3'|'16:9')} aspectRatio - The aspect ratio of the image (e.g., '1:1', '4:3'). Defaults to '1:1'.
 * @property {('standard'|'high')} quality - The desired quality of the image (e.g., 'standard', 'high'). Defaults to 'standard'.
 */

/**
 * Extracts image generation specifications (size, style, aspect ratio, quality) from a user's query string.
 * It parses keywords in the query to determine user preferences, applying default values if no preference is found.
 *
 * @param {string} query - The user's natural language query for image generation.
 * @returns {ImageSpecs} An object containing the extracted or default image specifications.
 */
export const extractImageSpecs = (query) => {
  const specs = {
    size: 'standard', // Default size
    style: 'realistic', // Default style
    aspectRatio: '1:1', // Default aspect ratio
    quality: 'standard', // Default quality
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
 * Generates a concise conversation title based on the user's image query and the type of operation.
 * The title is truncated if it exceeds a maximum length to ensure readability.
 *
 * @param {string} query - The user's original query string.
 * @param {'generation'|'analysis'} [type='generation'] - The type of operation, either 'generation' or 'analysis'.
 * @returns {string} A formatted conversation title.
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
 * @typedef {Object} ValidatedImagePreferences
 * @property {('small'|'standard'|'large')} size - The validated image size.
 * @property {('realistic'|'cartoon'|'abstract'|'photorealistic')} style - The validated image style.
 * @property {('1:1'|'3:4'|'4:3'|'16:9')} aspectRatio - The validated image aspect ratio.
 * @property {('standard'|'high')} quality - The validated image quality.
 */

/**
 * Validates and normalizes image preferences against a set of allowed values.
 * If a preference is invalid or missing, it defaults to a standard value.
 *
 * @param {Object} [preferences={}] - An object containing user-specified image preferences.
 * @param {string} [preferences.size] - Desired image size ('small', 'standard', 'large').
 * @param {string} [preferences.style] - Desired image style ('realistic', 'cartoon', 'abstract', 'photorealistic').
 * @param {string} [preferences.aspectRatio] - Desired image aspect ratio ('1:1', '3:4', '4:3', '16:9').
 * @param {string} [preferences.quality] - Desired image quality ('standard', 'high').
 * @returns {ValidatedImagePreferences} An object with validated and normalized image preferences.
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
 * Provides a list of suggested prompts based on keywords found in the user's input.
 * This helps guide users in generating more specific or creative images.
 *
 * @param {string} userInput - The current input string from the user.
 * @returns {Array<string>} An array of up to 3 suggested prompt strings.
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
    // Generic suggestions if no specific keywords are found
    suggestions.push(
      'Make the image more detailed',
      'Change the color scheme to blue tones',
      'Add more lighting effects',
      'Create a different style variation'
    );
  }

  return suggestions.slice(0, 3); // Return max 3 suggestions
};

/**
 * A collection of helper functions for image processing and response formatting.
 * These utilities assist in validating queries, formatting responses, extracting specifications,
 * and generating conversation titles within the image module.
 * @namespace imageHelpers
 * @property {function(string, Array|Object, string, number): ImageResponse} formatImageResponse - Formats image generation responses.
 * @property {function(string, string, number): AnalysisResponse} formatAnalysisResponse - Formats image analysis responses.
 * @property {function(string): ValidationResult} validateImageQuery - Validates the length and content of an image query.
 * @property {function(Error, string): string} formatErrorMessage - Formats an error into a user-friendly message.
 * @property {function(string): ImageSpecs} extractImageSpecs - Extracts image specifications from a user query.
 * @property {function(string, 'generation'|'analysis'): string} generateConversationTitle - Generates a conversation title from a query.
 * @property {function(Object): ValidatedImagePreferences} validateImagePreferences - Validates and normalizes image preferences.
 * @property {function(string): Array<string>} getSuggestedPrompts - Provides suggested prompts based on user input.
 */
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