// Conversation status constants
export const CONVERSATION_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
};

// Message role constants
export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
};

// Default pagination limits
export const PAGINATION_LIMITS = {
  CONVERSATIONS: 20,
  MESSAGES: 50,
  SEARCH_RESULTS: 10,
  RECENT_CONVERSATIONS: 5,
  BULK_OPERATIONS: 100,
};

// Rate limiting constants
export const RATE_LIMITS = {
  CREATE_CONVERSATION: { requests: 50, window: 15 }, // 50 per 15 minutes
  ADD_MESSAGE: { requests: 100, window: 15 }, // 100 per 15 minutes
  UPDATE_TITLE: { requests: 30, window: 15 }, // 30 per 15 minutes
  BULK_ARCHIVE: { requests: 10, window: 15 }, // 10 per 15 minutes
  BULK_DELETE: { requests: 5, window: 15 }, // 5 per 15 minutes
  DELETE_CONVERSATION: { requests: 20, window: 15 }, // 20 per 15 minutes
  PERMANENT_DELETE: { requests: 5, window: 15 }, // 5 per 15 minutes
};

// Conversation categories
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

// Sort options
export const SORT_OPTIONS = {
  LAST_ACTIVITY: 'lastActivity',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  MESSAGE_COUNT: 'messageCount',
  TITLE: 'title',
};

// Sort order
export const SORT_ORDER = {
  ASC: 1,
  DESC: -1,
};

// Default metadata values
export const DEFAULT_METADATA = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 1000,
  MODEL: 'gpt-3.5-turbo',
};

// Validation constants
export const VALIDATION_LIMITS = {
  TITLE_MAX_LENGTH: 255,
  MESSAGE_CONTENT_MIN_LENGTH: 1,
  MESSAGE_CONTENT_MAX_LENGTH: 10000,
  TAGS_MAX_COUNT: 10,
  TAG_MAX_LENGTH: 50,
  BULK_OPERATION_MAX_COUNT: 100,
};

// Conversation flags
export const CONVERSATION_FLAGS = {
  IS_PUBLIC: 'isPublic',
  IS_DEEP_SEARCH: 'is_deep_search',
};

// Error messages
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

// Success messages
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
