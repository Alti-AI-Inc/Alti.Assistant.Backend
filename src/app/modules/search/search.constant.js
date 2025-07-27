// Search specific constants
export const SEARCH_CONSTANTS = {
  CATEGORY: 'search',
  MODEL: 'research-agent',
  TYPE: 'assistant',
};

// User types for search
export const USER_TYPES = {
  AUTHENTICATED: 'authenticated',
  GUEST: 'guest',
};

// Guest user configuration
export const GUEST_USER_CONFIG = {
  ID_PREFIX: 'guest-',
  CONVERSATION_PREFIX: 'search-guest-',
  FEATURES: {
    CONVERSATION_HISTORY: false, // Guests don't get persistent history
    STATISTICS: false,
    UNLIMITED_USAGE: false,
    DEEP_SEARCH: true, // Allow deep search for guests
  },
};

// Search depth options
export const SEARCH_DEPTH = {
  STANDARD: 'standard',
  DEEP: 'deep',
};

// Search message types
export const SEARCH_MESSAGE_TYPES = {
  QUERY: 'search_query',
  RESULT: 'search_result',
  ERROR: 'error',
};

// Search rate limits
export const SEARCH_RATE_LIMITS = {
  SEARCH_REQUESTS: { requests: 30, window: 15 }, // 30 per 15 minutes
  STATS_REQUESTS: { requests: 10, window: 15 }, // 10 per 15 minutes
  GUEST_REQUESTS: { requests: 15, window: 60 }, // Lower limit for guests (future enhancement)
};

// Search validation limits
export const SEARCH_VALIDATION = {
  QUERY_MIN_LENGTH: 1,
  QUERY_MAX_LENGTH: 1000,
  TITLE_MAX_LENGTH: 50,
  HISTORY_LIMIT: 10,
};

// Search error messages
export const SEARCH_ERROR_MESSAGES = {
  QUERY_REQUIRED: 'Search query is required',
  QUERY_TOO_LONG: 'Search query too long',
  QUERY_EMPTY: 'Search query cannot be empty',
  PROCESSING_ERROR: 'An error occurred while processing your search request',
  CONVERSATION_ERROR: 'Failed to handle search conversation',
  UNAUTHORIZED: 'User authentication required',
  STATS_GUEST_ONLY: 'Statistics are only available for authenticated users',
  USER_ID_GENERATION_FAILED: 'Failed to generate user identifier',
};

// Search success messages
export const SEARCH_SUCCESS_MESSAGES = {
  SEARCH_COMPLETED: 'Search completed successfully',
  STATS_RETRIEVED: 'Search statistics retrieved successfully',
  CONVERSATION_CREATED: 'Search conversation created successfully',
  MESSAGE_ADDED: 'Search message added successfully',
};

// Default search metadata
export const DEFAULT_SEARCH_METADATA = {
  CATEGORY: 'search',
  MODEL: 'research-agent',
  TYPE: 'assistant',
};
