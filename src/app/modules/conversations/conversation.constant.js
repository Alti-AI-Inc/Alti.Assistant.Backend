/**
 * @fileoverview This file defines various constants used throughout the conversation module,
 * including status codes, message roles, pagination limits, rate limits, categories,
 * sort options, default metadata, validation limits, flags, and common error/success messages.
 * These constants help maintain consistency and centralize configuration for conversation-related operations.
 */

/**
 * @typedef {Object} ConversationStatus
 * @property {string} ACTIVE - Represents an active conversation.
 * @property {string} ARCHIVED - Represents an archived conversation.
 * @property {string} DELETED - Represents a deleted conversation.
 */
/**
 * Conversation status constants.
 * @type {ConversationStatus}
 */
export const CONVERSATION_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
};

/**
 * @typedef {Object} MessageRoles
 * @property {string} USER - Represents a message sent by the user.
 * @property {string} ASSISTANT - Represents a message sent by the AI assistant.
 * @property {string} SYSTEM - Represents a system message, often for context or instructions.
 */
/**
 * Message role constants.
 * @type {MessageRoles}
 */
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

/**
 * @typedef {Object} PaginationLimits
 * @property {number} CONVERSATIONS - Default limit for fetching conversations.
 * @property {number} MESSAGES - Default limit for fetching messages within a conversation.
 * @property {number} SEARCH_RESULTS - Default limit for search results.
 * @property {number} RECENT_CONVERSATIONS - Limit for fetching recent conversations.
 * @property {number} BULK_OPERATIONS - Limit for items in bulk operations.
 */
/**
 * Default pagination limits for various data types.
 * @type {PaginationLimits}
 */
export const PAGINATION_LIMITS = {
  CONVERSATIONS: 20,
  MESSAGES: 50,
  SEARCH_RESULTS: 10,
  RECENT_CONVERSATIONS: 5,
  BULK_OPERATIONS: 100,
};

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} requests - The maximum number of requests allowed.
 * @property {number} window - The time window in minutes for the rate limit.
 */
/**
 * @typedef {Object} RateLimits
 * @property {RateLimitConfig} CREATE_CONVERSATION - Rate limit for creating new conversations.
 * @property {RateLimitConfig} ADD_MESSAGE - Rate limit for adding messages to a conversation.
 * @property {RateLimitConfig} UPDATE_TITLE - Rate limit for updating a conversation's title.
 * @property {RateLimitConfig} BULK_ARCHIVE - Rate limit for bulk archiving conversations.
 * @property {RateLimitConfig} BULK_DELETE - Rate limit for bulk deleting conversations.
 * @property {RateLimitConfig} DELETE_CONVERSATION - Rate limit for deleting a single conversation.
 * @property {RateLimitConfig} PERMANENT_DELETE - Rate limit for permanently deleting a conversation.
 */
/**
 * Rate limiting constants for various API operations.
 * Each operation defines the number of requests allowed within a specific time window (in minutes).
 * @type {RateLimits}
 */
export const RATE_LIMITS = {
  CREATE_CONVERSATION: { requests: 50, window: 15 }, // 50 per 15 minutes
  ADD_MESSAGE: { requests: 100, window: 15 }, // 100 per 15 minutes
  UPDATE_TITLE: { requests: 30, window: 15 }, // 30 per 15 minutes
  BULK_ARCHIVE: { requests: 10, window: 15 }, // 10 per 15 minutes
  BULK_DELETE: { requests: 5, window: 15 }, // 5 per 15 minutes
  DELETE_CONVERSATION: { requests: 20, window: 15 }, // 20 per 15 minutes
  PERMANENT_DELETE: { requests: 5, window: 15 }, // 5 per 15 minutes
};

/**
 * @typedef {Object} ConversationCategories
 * @property {string} GENERAL - General purpose conversations.
 * @property {string} CODING - Conversations related to programming and development.
 * @property {string} CREATIVE - Conversations for creative writing, brainstorming, etc.
 * @property {string} BUSINESS - Conversations related to business topics.
 * @property {string} EDUCATION - Conversations for learning and educational purposes.
 * @property {string} RESEARCH - Conversations for research and information gathering.
 * @property {string} SUPPORT - Conversations for technical or customer support.
 * @property {string} OTHER - Miscellaneous or uncategorized conversations.
 */
/**
 * Conversation categories.
 * @type {ConversationCategories}
 */
export const CONVERSATION_CATEGORIES = {
  GENERAL: 'general',
  CODING: 'coding',
  CREATIVE: 'creative',
  BUSINESS: 'business',
  EDUCATION: 'education',
  RESEARCH: 'research',
  SUPPORT: 'support',
  OTHER: 'other',
};

/**
 * @typedef {Object} SortOptions
 * @property {string} LAST_ACTIVITY - Sort by the last activity timestamp.
 * @property {string} CREATED_AT - Sort by the creation timestamp.
 * @property {string} UPDATED_AT - Sort by the last update timestamp.
 * @property {string} MESSAGE_COUNT - Sort by the number of messages in the conversation.
 * @property {string} TITLE - Sort by the conversation title.
 */
/**
 * Sort options for conversations.
 * @type {SortOptions}
 */
export const SORT_OPTIONS = {
  LAST_ACTIVITY: 'lastActivity',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  MESSAGE_COUNT: 'messageCount',
  TITLE: 'title',
};

/**
 * @typedef {Object} SortOrder
 * @property {number} ASC - Ascending order (1).
 * @property {number} DESC - Descending order (-1).
 */
/**
 * Sort order values.
 * @type {SortOrder}
 */
export const SORT_ORDER = {
  ASC: 1,
  DESC: -1,
};

/**
 * @typedef {Object} DefaultMetadata
 * @property {number} TEMPERATURE - Default temperature setting for AI model generation.
 * @property {number} MAX_TOKENS - Default maximum tokens for AI model response.
 * @property {string} MODEL - Default AI model to use.
 */
/**
 * Default metadata values for AI model interactions.
 * @type {DefaultMetadata}
 */
export const DEFAULT_METADATA = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 1000,
  MODEL: 'gpt-3.5-turbo',
};

/**
 * @typedef {Object} ValidationLimits
 * @property {number} TITLE_MAX_LENGTH - Maximum length allowed for a conversation title.
 * @property {number} MESSAGE_CONTENT_MIN_LENGTH - Minimum length allowed for message content.
 * @property {number} MESSAGE_CONTENT_MAX_LENGTH - Maximum length allowed for message content.
 * @property {number} TAGS_MAX_COUNT - Maximum number of tags allowed per conversation.
 * @property {number} TAG_MAX_LENGTH - Maximum length allowed for a single tag.
 * @property {number} BULK_OPERATION_MAX_COUNT - Maximum number of items allowed in a single bulk operation.
 */
/**
 * Validation constants defining various limits for data fields.
 * @type {ValidationLimits}
 */
export const VALIDATION_LIMITS = {
  TITLE_MAX_LENGTH: 255,
  MESSAGE_CONTENT_MIN_LENGTH: 1,
  MESSAGE_CONTENT_MAX_LENGTH: 10000,
  TAGS_MAX_COUNT: 10,
  TAG_MAX_LENGTH: 50,
  BULK_OPERATION_MAX_COUNT: 100,
};

/**
 * @typedef {Object} ConversationFlags
 * @property {string} IS_PUBLIC - Flag indicating if a conversation is public.
 * @property {string} IS_DEEP_SEARCH - Flag indicating if a deep search should be performed.
 */
/**
 * Conversation flags.
 * @type {ConversationFlags}
 */
export const CONVERSATION_FLAGS = {
  IS_PUBLIC: 'isPublic',
  IS_DEEP_SEARCH: 'is_deep_search',
};

/**
 * @typedef {Object} ErrorMessages
 * @property {string} CONVERSATION_NOT_FOUND - Error message when a conversation is not found.
 * @property {string} UNAUTHORIZED_ACCESS - Error message for unauthorized access attempts.
 * @property {string} INVALID_MESSAGE_ROLE - Error message for an invalid message role.
 * @property {string} TITLE_TOO_LONG - Error message when a title exceeds maximum length.
 * @property {string} MESSAGE_CONTENT_EMPTY - Error message when message content is empty.
 * @property {string} INVALID_CONVERSATION_ID - Error message for an invalid conversation ID format.
 * @property {string} BULK_OPERATION_LIMIT_EXCEEDED - Error message when bulk operation limit is exceeded.
 * @property {string} RATE_LIMIT_EXCEEDED - Error message when API rate limit is exceeded.
 */
/**
 * Common error messages used throughout the conversation module.
 * @type {ErrorMessages}
 */
export const ERROR_MESSAGES = {
  CONVERSATION_NOT_FOUND: 'Conversation not found',
  UNAUTHORIZED_ACCESS: 'Unauthorized access to conversation',
  INVALID_MESSAGE_ROLE: 'Invalid message role',
  TITLE_TOO_LONG: 'Title exceeds maximum length',
  MESSAGE_CONTENT_EMPTY: 'Message content cannot be empty',
  INVALID_CONVERSATION_ID: 'Invalid conversation ID format',
  BULK_OPERATION_LIMIT_EXCEEDED: 'Bulk operation limit exceeded',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
};

/**
 * @typedef {Object} SuccessMessages
 * @property {string} CONVERSATION_CREATED - Success message for conversation creation.
 * @property {string} MESSAGE_ADDED - Success message for adding a message.
 * @property {string} TITLE_UPDATED - Success message for updating conversation title.
 * @property {string} CONVERSATION_ARCHIVED - Success message for archiving a conversation.
 * @property {string} CONVERSATION_RESTORED - Success message for restoring a conversation.
 * @property {string} CONVERSATION_DELETED - Success message for deleting a conversation.
 * @property {string} MESSAGES_CLEARED - Success message for clearing conversation messages.
 * @property {string} TAGS_ADDED - Success message for adding tags.
 * @property {string} BULK_OPERATION_COMPLETED - Success message for completing a bulk operation.
 */
/**
 * Common success messages used throughout the conversation module.
 * @type {SuccessMessages}
 */
export const SUCCESS_MESSAGES = {
  CONVERSATION_CREATED: 'Conversation created successfully',
  MESSAGE_ADDED: 'Message added successfully',
  TITLE_UPDATED: 'Conversation title updated successfully',
  CONVERSATION_ARCHIVED: 'Conversation archived successfully',
  CONVERSATION_RESTORED: 'Conversation restored successfully',
  CONVERSATION_DELETED: 'Conversation deleted successfully',
  MESSAGES_CLEARED: 'Conversation messages cleared successfully',
  TAGS_ADDED: 'Tags added successfully',
  BULK_OPERATION_COMPLETED: 'Bulk operation completed successfully',
};