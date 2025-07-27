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
