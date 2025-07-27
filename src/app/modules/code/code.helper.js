import { logger } from '../../../shared/logger.js';
import { CODE_ASSISTANT_CONSTANTS } from './code.constant.js';

/**
 * Format code response for client
 * @param {string} response
 * @param {string} conversationId
 * @param {number} messageCount
 * @returns {Object}
 */
export const formatCodeResponse = (response, conversationId, messageCount) => {
  try {
    // Try to parse if it's JSON
    const parsedResponse = response.startsWith("{") && response.endsWith("}") 
      ? JSON.parse(response) 
      : response;

    return {
      responseMessage: parsedResponse,
      conversationId,
      messageCount,
    };
  } catch (error) {
    logger.warn('Failed to parse code response as JSON, returning as string:', error);
    return {
      responseMessage: response,
      conversationId,
      messageCount,
    };
  }
};

/**
 * Validate code query length and content
 * @param {string} message
 * @returns {Object}
 */
export const validateCodeQuery = (message) => {
  if (!message || typeof message !== 'string') {
    return {
      isValid: false,
      error: 'Code query must be a non-empty string',
    };
  }

  if (message.length > CODE_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH) {
    return {
      isValid: false,
      error: `Code query too long. Maximum ${CODE_ASSISTANT_CONSTANTS.MESSAGE.MAX_LENGTH} characters allowed`,
    };
  }

  return {
    isValid: true,
  };
};

/**
 * Generate conversation title from code query
 * @param {string} codeQuery
 * @returns {string}
 */
export const generateConversationTitle = (codeQuery) => {
  const maxLength = CODE_ASSISTANT_CONSTANTS.CONVERSATION.TITLE_MAX_LENGTH;
  const title = `Code: ${codeQuery.substring(0, maxLength)}`;
  return codeQuery.length > maxLength ? `${title}...` : title;
};

/**
 * Extract programming language from code query
 * @param {string} message
 * @returns {string|null}
 */
export const extractProgrammingLanguage = (message) => {
  const languages = [
    'javascript', 'python', 'java', 'typescript', 'php', 'ruby', 'go', 'rust',
    'c++', 'c#', 'swift', 'kotlin', 'scala', 'html', 'css', 'sql', 'bash',
    'powershell', 'react', 'vue', 'angular', 'node', 'express', 'django',
    'flask', 'spring', 'laravel'
  ];

  const lowerMessage = message.toLowerCase();
  
  for (const lang of languages) {
    if (lowerMessage.includes(lang)) {
      return lang;
    }
  }
  
  return null;
};

/**
 * Format error for conversation storage
 * @param {Error} error
 * @param {string} userMessage
 * @returns {string}
 */
export const formatErrorMessage = (error, userMessage) => {
  logger.error(`Code Assistant Error for query: "${userMessage}":`, error);
  
  // Return user-friendly error message
  return 'I apologize, but an error occurred while processing your code request. Please try again or rephrase your question.';
};

export const codeHelpers = {
  formatCodeResponse,
  validateCodeQuery,
  generateConversationTitle,
  extractProgrammingLanguage,
  formatErrorMessage,
};
