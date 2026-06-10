import { logger } from '../../../shared/logger.js';
import { CODE_ASSISTANT_CONSTANTS } from './code.constant.js';

/**
 * Formats the response from the code assistant for client-side consumption.
 * It attempts to parse the response as JSON. If parsing fails, it returns the original string response.
 * This ensures a consistent object structure is sent to the client.
 * @param {string} response The raw response string from the code assistant service.
 * @param {string} conversationId The unique identifier for the current conversation.
 * @param {number} messageCount The total number of messages in the conversation after this response.
 * @returns {{responseMessage: (object|string), conversationId: string, messageCount: number}} An object containing the formatted response, conversation ID, and message count.
 */
export const formatCodeResponse = (response, conversationId, messageCount) => {
  try {
    // Try to parse if it's JSON
    const parsedResponse =
      response.startsWith('{') && response.endsWith('}')
        ? JSON.parse(response)
        : response;

    return {
      responseMessage: parsedResponse,
      conversationId,
      messageCount,
    };
  } catch (error) {
    logger.warn(
      'Failed to parse code response as JSON, returning as string:',
      error
    );
    return {
      responseMessage: response,
      conversationId,
      messageCount,
    };
  }
};

/**
 * Validates the user's code query against predefined constraints.
 * Checks if the message is a non-empty string and does not exceed the maximum allowed length.
 * @param {string} message The user's input query string.
 * @returns {{isValid: boolean, error?: string}} An object indicating if the query is valid. If not, it includes an error message.
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
 * Generates a concise title for a new conversation based on the initial code query.
 * The title is prefixed with "Code: " and truncated if it exceeds the maximum length.
 * @param {string} codeQuery The initial user query that starts the conversation.
 * @returns {string} A formatted and truncated string suitable for a conversation title.
 */
export const generateConversationTitle = (codeQuery) => {
  const maxLength = CODE_ASSISTANT_CONSTANTS.CONVERSATION.TITLE_MAX_LENGTH;
  const title = `Code: ${codeQuery.substring(0, maxLength)}`;
  return codeQuery.length > maxLength ? `${title}...` : title;
};

/**
 * Attempts to extract a programming language or framework name from the user's message.
 * It checks the message against a predefined list of common languages and technologies.
 * @param {string} message The user's query string.
 * @returns {string|null} The name of the detected language in lowercase, or null if no match is found.
 */
export const extractProgrammingLanguage = (message) => {
  const languages = [
    'javascript',
    'python',
    'java',
    'typescript',
    'php',
    'ruby',
    'go',
    'rust',
    'c++',
    'c#',
    'swift',
    'kotlin',
    'scala',
    'html',
    'css',
    'sql',
    'bash',
    'powershell',
    'react',
    'vue',
    'angular',
    'node',
    'express',
    'django',
    'flask',
    'spring',
    'laravel',
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
 * Formats an error for storage and client response.
 * It logs the detailed technical error for debugging purposes and returns a generic,
 * user-friendly message to be displayed to the end-user, avoiding exposure of internal error details.
 * @param {Error} error The caught error object.
 * @param {string} userMessage The original user query that led to the error.
 * @returns {string} A generic, user-friendly error message.
 */
export const formatErrorMessage = (error, userMessage) => {
  logger.error(`Code Assistant Error for query: "${userMessage}":`, error);

  // Return user-friendly error message
  return 'I apologize, but an error occurred while processing your code request. Please try again or rephrase your question.';
};

/**
 * A collection of helper functions for the code assistant module.
 * This object consolidates various utility functions for formatting, validation,
 * and error handling related to code assistant interactions.
 * @namespace codeHelpers
 */
export const codeHelpers = {
  formatCodeResponse,
  validateCodeQuery,
  generateConversationTitle,
  extractProgrammingLanguage,
  formatErrorMessage,
};