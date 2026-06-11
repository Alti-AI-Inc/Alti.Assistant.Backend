import { logger } from '../../../shared/logger.js';
import { VIDEO_ASSISTANT_CONSTANTS } from './video.constant.js';

/**
 * Format video generation response for client.
 * @param {string} response - The text response to send to the user.
 * @param {string|Object} videoData - The URL or data for the generated video.
 * @param {string} conversationId - The ID of the current conversation.
 * @param {number} messageCount - The current message count in the conversation.
 * @returns {Object} - The formatted response object for the client.
 */
export const formatVideoResponse = (
  response,
  videoData,
  conversationId,
  messageCount
) => {
  // Removed unnecessary try-catch block as simple object creation is not expected to fail.
  // This simplifies the code and improves readability.
  return {
    responseMessage: {
      text: response,
      video: videoData || null,
      type: 'generation',
    },
    conversationId,
    messageCount,
  };
};

/**
 * Format video analysis response for client.
 * @param {string} response - The text response from the analysis.
 * @param {string} conversationId - The ID of the current conversation.
 * @param {number} messageCount - The current message count in the conversation.
 * @returns {Object} - The formatted response object for the client.
 */
export const formatAnalysisResponse = (
  response,
  conversationId,
  messageCount
) => {
  // Removed unnecessary try-catch block for simplicity and clarity.
  return {
    responseMessage: {
      text: response,
      type: 'analysis',
    },
    conversationId,
    messageCount,
  };
};

/**
 * Validate video query length and content.
 * This ensures prompts meet the system's constraints, preventing errors and resource waste.
 * @param {string} message - The user's input prompt.
 * @returns {Object} - An object containing a boolean 'isValid' and an optional 'error' message.
 */
export const validateVideoQuery = (message) => {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return {
      isValid: false,
      // Provide a clear error message for better UX.
      error: 'Video query must be a non-empty string.',
    };
  }

  const trimmedMessage = message.trim();

  if (trimmedMessage.length > VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH) {
    return {
      isValid: false,
      error: `Video query is too long. Please limit your prompt to ${VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH} characters.`,
    };
  }

  if (trimmedMessage.length < VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH) {
    return {
      isValid: false,
      error: `Video query is too short. Please provide at least ${VIDEO_ASSISTANT_CONSTANTS.MESSAGE.MIN_LENGTH} characters.`,
    };
  }

  return {
    isValid: true,
  };
};

/**
 * Format a generic error message for user consumption, hiding internal details.
 * @param {Error} error - The error object caught by the system.
 * @returns {string} - A user-friendly error message.
 */
export const formatErrorMessage = (error) => {
  // Log the actual error for debugging purposes, helping developers improve error handling.
  logger.warn(
    'Formatting a generic error for the user. Consider creating a specific error type.',
    {
      errorMessage: error.message,
    }
  );

  const baseMessage =
    'I apologize, but I encountered an error while processing your video request.';

  // Use optional chaining and convert to lower case for robust, case-insensitive matching.
  const errorMessage = error.message?.toLowerCase() || '';

  if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
    return `${baseMessage} It seems we've reached our service limits. Please try again in a few minutes.`;
  }

  if (errorMessage.includes('invalid') || errorMessage.includes('format')) {
    return `${baseMessage} Please check your video format or prompt and try again.`;
  }

  if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
    return `${baseMessage} There seems to be a connectivity issue. Please try again.`;
  }

  // A polite and actionable default message for unhandled errors.
  return `${baseMessage} Please try rephrasing your request or try again later.`;
};

/**
 * Extract video specifications from a natural language user query.
 * @param {string} query - The user's input prompt.
 * @returns {Object} - An object containing extracted video specifications.
 */
export const extractVideoSpecs = (query) => {
  const specs = {
    // Default values provide a consistent baseline for video generation.
    duration: 10, // Default duration in seconds
    style: 'realistic',
    resolution: '1080p',
    aspectRatio: '16:9',
  };

  const lowerQuery = query.toLowerCase();

  // Improved duration extraction using regex to capture specific numbers (e.g., "15 seconds").
  // This is more flexible and user-friendly than hardcoded string checks.
  const durationMatch = lowerQuery.match(/(\d+)\s*(?:second|sec)s?/);
  if (durationMatch && durationMatch[1]) {
    const requestedDuration = parseInt(durationMatch[1], 10);
    // Clamp the duration to a valid range to prevent abuse or errors from upstream services.
    specs.duration = Math.max(
      VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.MIN_DURATION,
      Math.min(
        VIDEO_ASSISTANT_CONSTANTS.VIDEO_SPECS.MAX_DURATION,
        requestedDuration
      )
    );
  } else if (lowerQuery.includes('short') || lowerQuery.includes('quick')) {
    specs.duration = 5;
  } else if (
    lowerQuery.includes('long') ||
    lowerQuery.includes('half minute')
  ) {
    specs.duration = 30;
  }

  // Extract style preferences using simple keyword matching.
  if (
    lowerQuery.includes('cartoon') ||
    lowerQuery.includes('animated') ||
    lowerQuery.includes('comic')
  ) {
    specs.style = 'cartoon';
  } else if (
    lowerQuery.includes('cinematic') ||
    lowerQuery.includes('movie') ||
    lowerQuery.includes('film')
  ) {
    specs.style = 'cinematic';
  } else if (
    lowerQuery.includes('abstract') ||
    lowerQuery.includes('artistic')
  ) {
    specs.style = 'abstract';
  }

  // Extract resolution preferences.
  if (
    lowerQuery.includes('4k') ||
    lowerQuery.includes('ultra hd') ||
    lowerQuery.includes('uhd')
  ) {
    specs.resolution = '4k';
  } else if (lowerQuery.includes('720p') || lowerQuery.includes('hd')) {
    specs.resolution = '720p';
  }

  // Extract aspect ratio preferences.
  if (lowerQuery.includes('square') || lowerQuery.includes('1:1')) {
    specs.aspectRatio = '1:1';
  } else if (
    lowerQuery.includes('portrait') ||
    lowerQuery.includes('9:16') ||
    lowerQuery.includes('vertical')
  ) {
    specs.aspectRatio = '9:16';
  } else if (
    lowerQuery.includes('widescreen') ||
    lowerQuery.includes('21:9') ||
    lowerQuery.includes('ultrawide')
  ) {
    specs.aspectRatio = '21:9';
  }

  return specs;
};

/**
 * Validate video specifications against allowed values.
 * This prevents invalid parameters from being sent to the video generation service.
 * @param {Object} specs - The video specifications object.
 * @returns {Object} - An object containing a boolean 'isValid' and an array of 'errors'.
 */
export const validateVideoSpecs = (specs) => {
  const errors = [];
  const { VIDEO_SPECS } = VIDEO_ASSISTANT_CONSTANTS;

  // Validate duration against min/max constants.
  if (
    specs.duration &&
    (specs.duration < VIDEO_SPECS.MIN_DURATION ||
      specs.duration > VIDEO_SPECS.MAX_DURATION)
  ) {
    errors.push(
      `Duration must be between ${VIDEO_SPECS.MIN_DURATION} and ${VIDEO_SPECS.MAX_DURATION} seconds.`
    );
  }

  // Validate style against a predefined list of supported styles.
  const validStyles = Object.values(VIDEO_SPECS.STYLES);
  if (specs.style && !validStyles.includes(specs.style)) {
    errors.push(`Style must be one of: ${validStyles.join(', ')}.`);
  }

  // Validate resolution against a predefined list.
  const validResolutions = Object.values(VIDEO_SPECS.RESOLUTIONS);
  if (specs.resolution && !validResolutions.includes(specs.resolution)) {
    errors.push(`Resolution must be one of: ${validResolutions.join(', ')}.`);
  }

  // Added validation for aspect ratio for consistency and robustness.
  const validAspectRatios = Object.values(VIDEO_SPECS.ASPECT_RATIOS);
  if (specs.aspectRatio && !validAspectRatios.includes(specs.aspectRatio)) {
    errors.push(
      `Aspect ratio must be one of: ${validAspectRatios.join(', ')}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Format the final assistant response based on the type of result.
 * This acts as a router to ensure the client receives a consistently structured object.
 * @param {Object} result - The result from the video service.
 * @param {string} conversationId - The ID of the current conversation.
 * @param {number} messageCount - The current message count in the conversation.
 * @returns {Object} - The final formatted response object.
 */
export const formatAssistantResponse = (
  result,
  conversationId,
  messageCount
) => {
  if (result.videoUrl) {
    return formatVideoResponse(
      result.response || VIDEO_ASSISTANT_CONSTANTS.SUCCESS.VIDEO_GENERATED,
      result.videoUrl,
      conversationId,
      messageCount
    );
  } else if (result.responseMessage) {
    return formatAnalysisResponse(
      result.responseMessage,
      conversationId,
      messageCount
    );
  } else {
    // Provide a helpful default message if the result is ambiguous.
    return formatAnalysisResponse(
      "I'm processing your video request. Could you provide more details?",
      conversationId,
      messageCount
    );
  }
};

/**
 * Get a user-friendly error message based on a specific, categorized error type.
 * This structured approach is preferred over parsing raw error strings.
 * @param {string} errorType - A key representing the type of error.
 * @returns {string} - The corresponding user-friendly error message.
 */
export const getUserErrorMessage = (errorType) => {
  const errorMap = {
    rate_limit: VIDEO_ASSISTANT_CONSTANTS.ERRORS.RATE_LIMIT,
    quota_exceeded: VIDEO_ASSISTANT_CONSTANTS.ERRORS.QUOTA_EXCEEDED,
    network_error: VIDEO_ASSISTANT_CONSTANTS.ERRORS.NETWORK_ERROR,
    invalid_format: VIDEO_ASSISTANT_CONSTANTS.ERRORS.INVALID_FORMAT,
    generation_failed: VIDEO_ASSISTANT_CONSTANTS.ERRORS.GENERATION_FAILED,
  };

  return errorMap[errorType] || VIDEO_ASSISTANT_CONSTANTS.MESSAGE.DEFAULT_ERROR;
};

// Export all helpers in a single object for easy importing and usage.
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