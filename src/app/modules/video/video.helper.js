import { logger } from '../../../shared/logger.js';
import { VIDEO_ASSISTANT_CONSTANTS } from './video.constant.js';

/**
 * Format video generation response for client
 * @param {string} response
 * @param {string|Object} videoData
 * @param {string} conversationId
 * @param {number} messageCount
 * @returns {Object}
 */
export const formatVideoResponse = (response, videoData, conversationId, messageCount) => {
  try {
    return {
      responseMessage: {
        text: response,
        video: videoData || null,
        type: 'generation'
      },
      conversationId,
      messageCount,
    };
  } catch (error) {
    logger.warn('Failed to format video response:', error);
    return {
      responseMessage: {
        text: response,
        video: null,
        type: 'generation'
      },
      conversationId,
      messageCount,
    };
  }
};

/**
 * Format video analysis response for client
 * @param {string} response
 * @param {string} conversationId
 * @param {number} messageCount
 * @returns {Object}
 */
export const formatAnalysisResponse = (response, conversationId, messageCount) => {
  try {
    return {
      responseMessage: {
        text: response,
        type: 'analysis'
      },
      conversationId,
      messageCount,
    };
  } catch (error) {
    logger.warn('Failed to format analysis response:', error);
    return {
      responseMessage: {
        text: response,
        type: 'analysis'
      },
      conversationId,
      messageCount,
    };
  }
};

/**
 * Validate video query length and content
 * @param {string} message
 * @returns {Object}
 */
export const validateVideoQuery = (message) => {
  if (!message || typeof message !== 'string') {
    return {
      isValid: false,
      error: 'Video query must be a non-empty string',
    };
  }

  if (message.length > VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH) {
    return {
      isValid: false,
      error: `Video query too long. Maximum ${VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH} characters allowed`,
    };
  }

  if (message.length < VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH) {
    return {
      isValid: false,
      error: `Video query too short. Minimum ${VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH} characters required`,
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
  const baseMessage = "I apologize, but I encountered an error while processing your video request.";

  // Don't expose internal error details to users
  if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
    return `${baseMessage} It seems we've reached our service limits. Please try again in a few minutes.`;
  }

  if (error.message?.includes('invalid') || error.message?.includes('format')) {
    return `${baseMessage} Please check your video format or prompt and try again.`;
  }

  if (error.message?.includes('network') || error.message?.includes('timeout')) {
    return `${baseMessage} There seems to be a connectivity issue. Please try again.`;
  }

  return `${baseMessage} Please try rephrasing your request or try again later.`;
};

/**
 * Extract video specifications from user query
 * @param {string} query
 * @returns {Object}
 */
export const extractVideoSpecs = (query) => {
  const specs = {
    duration: 10,
    style: 'realistic',
    resolution: '1080p',
    aspectRatio: '16:9'
  };

  const lowerQuery = query.toLowerCase();

  // Extract duration preferences
  if (lowerQuery.includes('short') || lowerQuery.includes('quick') || lowerQuery.includes('5 second')) {
    specs.duration = 5;
  } else if (lowerQuery.includes('long') || lowerQuery.includes('30 second') || lowerQuery.includes('half minute')) {
    specs.duration = 30;
  }

  // Extract style preferences
  if (lowerQuery.includes('cartoon') || lowerQuery.includes('animated') || lowerQuery.includes('comic')) {
    specs.style = 'cartoon';
  } else if (lowerQuery.includes('cinematic') || lowerQuery.includes('movie') || lowerQuery.includes('film')) {
    specs.style = 'cinematic';
  } else if (lowerQuery.includes('abstract') || lowerQuery.includes('artistic')) {
    specs.style = 'abstract';
  }

  // Extract resolution preferences
  if (lowerQuery.includes('4k') || lowerQuery.includes('ultra hd') || lowerQuery.includes('uhd')) {
    specs.resolution = '4k';
  } else if (lowerQuery.includes('720p') || lowerQuery.includes('hd')) {
    specs.resolution = '720p';
  }

  // Extract aspect ratio preferences
  if (lowerQuery.includes('square') || lowerQuery.includes('1:1')) {
    specs.aspectRatio = '1:1';
  } else if (lowerQuery.includes('portrait') || lowerQuery.includes('9:16') || lowerQuery.includes('vertical')) {
    specs.aspectRatio = '9:16';
  } else if (lowerQuery.includes('widescreen') || lowerQuery.includes('21:9') || lowerQuery.includes('ultrawide')) {
    specs.aspectRatio = '21:9';
  }

  return specs;
};

/**
 * Validate video specifications
 * @param {Object} specs
 * @returns {Object}
 */
export const validateVideoSpecs = (specs) => {
  const errors = [];

  // Validate duration
  if (specs.duration && (specs.duration < 1 || specs.duration > 60)) {
    errors.push('Duration must be between 1 and 60 seconds');
  }

  // Validate style
  const validStyles = Object.values(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.STYLES);
  if (specs.style && !validStyles.includes(specs.style)) {
    errors.push(`Style must be one of: ${validStyles.join(', ')}`);
  }

  // Validate resolution
  const validResolutions = Object.values(VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.RESOLUTIONS);
  if (specs.resolution && !validResolutions.includes(specs.resolution)) {
    errors.push(`Resolution must be one of: ${validResolutions.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Format video response for different response types
 * @param {Object} result
 * @param {string} conversationId
 * @param {number} messageCount
 * @returns {Object}
 */
export const formatAssistantResponse = (result, conversationId, messageCount) => {
  if (result.videoUrl) {
    return formatVideoResponse(
      result.response || VIDEO_ASSISTANT_CONSTANTS.SUCCESS.VIDEO_GENERATED,
      result.videoUrl,
      conversationId,
      messageCount
    );
  } else if (result.responseMessage) {
    return formatAnalysisResponse(result.responseMessage, conversationId, messageCount);
  } else {
    return formatAnalysisResponse(
      "I'm processing your video request. Could you provide more details?",
      conversationId,
      messageCount
    );
  }
};

/**
 * Get user-friendly error message based on error type
 * @param {string} errorType
 * @returns {string}
 */
export const getUserErrorMessage = (errorType) => {
  const errorMap = {
    'rate_limit': VIDEO_ASSISTANT_CONSTANTS.ERRORS.RATE_LIMIT,
    'quota_exceeded': VIDEO_ASSISTANT_CONSTANTS.ERRORS.QUOTA_EXCEEDED,
    'network_error': VIDEO_ASSISTANT_CONSTANTS.ERRORS.NETWORK_ERROR,
    'invalid_format': VIDEO_ASSISTANT_CONSTANTS.ERRORS.INVALID_FORMAT,
    'generation_failed': VIDEO_ASSISTANT_CONSTANTS.ERRORS.GENERATION_FAILED,
  };

  return errorMap[errorType] || VIDEO_ASSISTANT_CONSTANTS.MESSAGE.DEFAULT_ERROR;
};

export const videoHelpers = {
  formatVideoResponse,
  formatAnalysisResponse,
  validateVideoQuery,
  formatErrorMessage,
  extractVideoSpecs,
  validateVideoSpecs,
  formatAssistantResponse,
  getUserErrorMessage,
};