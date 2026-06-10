/**
 * @fileoverview Constants and configuration settings for the Code Assistant module.
 * This file defines rate limits, conversation constraints, message types, model configurations,
 * and guest user limitations.
 * @module CodeAssistantConstants
 */

/**
 * Configuration constants for the Code Assistant module.
 * @type {Object}
 * @property {Object} RATE_LIMIT Rate limiting configurations for different user types.
 * @property {number} RATE_LIMIT.REQUESTS Number of allowed requests for authenticated users.
 * @property {number} RATE_LIMIT.WINDOW_MINUTES Time window in minutes for authenticated users' rate limit.
 * @property {number} RATE_LIMIT.GUEST_REQUESTS Number of allowed requests for guest users.
 * @property {number} RATE_LIMIT.GUEST_WINDOW_MINUTES Time window in minutes for guest users' rate limit.
 * @property {Object} CONVERSATION Configuration limits for conversations.
 * @property {number} CONVERSATION.MAX_HISTORY_LENGTH Maximum number of messages to retain in conversation history.
 * @property {number} CONVERSATION.TITLE_MAX_LENGTH Maximum character length for conversation titles.
 * @property {Object} MESSAGE Configuration limits and types for messages.
 * @property {number} MESSAGE.MAX_LENGTH Maximum character length for a single message.
 * @property {Object} MESSAGE.TYPES Message type identifiers.
 * @property {string} MESSAGE.TYPES.QUERY Identifier for a code query message.
 * @property {string} MESSAGE.TYPES.RESULT Identifier for a code result message.
 * @property {string} MESSAGE.TYPES.ERROR Identifier for an error message.
 * @property {Object} MODEL Configuration for the AI model used.
 * @property {string} MODEL.NAME Name of the code assistant model.
 * @property {string} MODEL.CATEGORY Category classification of the model.
 * @property {Object} USER_TYPES Supported user types.
 * @property {string} USER_TYPES.AUTHENTICATED Identifier for authenticated users.
 * @property {string} USER_TYPES.GUEST Identifier for guest users.
 * @property {Object} GUEST Configuration and feature flags for guest users.
 * @property {string} GUEST.ID_PREFIX Prefix used for guest user IDs.
 * @property {string} GUEST.CONVERSATION_PREFIX Prefix used for guest conversation IDs.
 * @property {Object} GUEST.FEATURES Feature flags indicating what guests can access.
 * @property {boolean} GUEST.FEATURES.CONVERSATION_HISTORY Whether guests have persistent conversation history.
 * @property {boolean} GUEST.FEATURES.STATISTICS Whether guests have access to statistics.
 * @property {boolean} GUEST.FEATURES.UNLIMITED_USAGE Whether guests have unlimited usage.
 */
export const CODE_ASSISTANT_CONSTANTS = {
  RATE_LIMIT: {
    REQUESTS: 30,
    WINDOW_MINUTES: 15,
    GUEST_REQUESTS: 10, // Lower limit for guest users (future enhancement)
    GUEST_WINDOW_MINUTES: 60,
  },
  CONVERSATION: {
    MAX_HISTORY_LENGTH: 10,
    TITLE_MAX_LENGTH: 50,
  },
  MESSAGE: {
    MAX_LENGTH: 5000,
    TYPES: {
      QUERY: 'code_query',
      RESULT: 'code_result',
      ERROR: 'error',
    },
  },
  MODEL: {
    NAME: 'code-assistant',
    CATEGORY: 'code',
  },
  USER_TYPES: {
    AUTHENTICATED: 'authenticated',
    GUEST: 'guest',
  },
  GUEST: {
    ID_PREFIX: 'guest-',
    CONVERSATION_PREFIX: 'code-guest-',
    FEATURES: {
      CONVERSATION_HISTORY: false, // Guests don't get persistent history
      STATISTICS: false,
      UNLIMITED_USAGE: false,
    },
  },
};