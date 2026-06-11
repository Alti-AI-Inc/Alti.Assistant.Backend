/**
 * @fileoverview Constants and configuration settings for the Code Assistant module.
 * This file defines rate limits, conversation constraints, message types, model configurations,
 * guest user limitations, user roles, and notification thresholds.
 * @module CodeAssistantConstants
 */

// BUG-FIX: The original USER_TYPES was too simplistic and did not account for the application's hierarchical role structure.
// FIX: Replaced USER_TYPES with a more granular ROLES object to support proper permissioning and feature flagging for super_admin, admin, manager, and user roles.
const ROLES = {
  SUPER_ADMIN: 'super_admin', // Platform owner with unrestricted access.
  ADMIN: 'admin',             // Workspace owner, manages managers and users.
  MANAGER: 'manager',         // Team lead, manages users.
  USER: 'user',               // Standard authenticated user.
  GUEST: 'guest',             // Unauthenticated user with limited access.
};

/**
 * Configuration constants for the Code Assistant module.
 * @type {Object}
 * @property {Object} ROLES Defines the user roles within the system.
 * @property {string} ROLES.SUPER_ADMIN Role for platform owners.
 * @property {string} ROLES.ADMIN Role for workspace owners.
 * @property {string} ROLES.MANAGER Role for team managers.
 * @property {string} ROLES.USER Role for standard users.
 * @property {string} ROLES.GUEST Role for unauthenticated guest users.
 * @property {Object} RATE_LIMIT Rate limiting configurations for different user roles.
 * @property {Object.<string, {REQUESTS: number, WINDOW_MINUTES: number}>} RATE_LIMIT Each key corresponds to a role name (e.g., 'super_admin', 'admin').
 * @property {number} RATE_LIMIT.*.REQUESTS Number of allowed requests. A value of -1 signifies unlimited requests.
 * @property {number} RATE_LIMIT.*.WINDOW_MINUTES The time window in minutes for the request limit.
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
 * @property {Object} NOTIFICATIONS Configuration for usage-based notifications.
 * @property {number} NOTIFICATIONS.USAGE_WARNING_THRESHOLD_PERCENT Usage percentage to trigger a warning notification to managers/admins.
 * @property {number} NOTIFICATIONS.USAGE_LIMIT_REACHED_THRESHOLD_PERCENT Usage percentage to trigger a limit-reached notification.
 * @property {Object} GCP_PUBSUB Configuration for Google Cloud Pub/Sub topics.
 * @property {Object} GCP_PUBSUB.TOPICS Defines the topic names for asynchronous tasks.
 * @property {string} GCP_PUBSUB.TOPICS.USER_USAGE_WARNING Topic for user usage warning notifications.
 * @property {string} GCP_PUBSUB.TOPICS.USER_USAGE_LIMIT_REACHED Topic for user usage limit reached notifications.
 * @property {Object} GUEST Configuration and feature flags for guest users.
 * @property {string} GUEST.ID_PREFIX Prefix used for guest user IDs.
 * @property {string} GUEST.CONVERSATION_PREFIX Prefix used for guest conversation IDs.
 * @property {Object} GUEST.FEATURES Feature flags indicating what guests can access.
 * @property {boolean} GUEST.FEATURES.CONVERSATION_HISTORY Whether guests have persistent conversation history.
 * @property {boolean} GUEST.FEATURES.STATISTICS Whether guests have access to statistics.
 * @property {boolean} GUEST.FEATURES.UNLIMITED_USAGE Whether guests have unlimited usage.
 */
export const CODE_ASSISTANT_CONSTANTS = {
  ROLES,

  // HIERARCHY-GAP: The original rate limit was a flat value for all authenticated users, failing to respect the role hierarchy.
  // FIX: Implemented role-based rate limiting to provide granular control over usage for different user tiers. This is critical for managing tenant resources and preventing abuse.
  RATE_LIMIT: {
    [ROLES.SUPER_ADMIN]: { REQUESTS: -1, WINDOW_MINUTES: 1 }, // -1 signifies unlimited requests
    [ROLES.ADMIN]: { REQUESTS: 1000, WINDOW_MINUTES: 60 },
    [ROLES.MANAGER]: { REQUESTS: 500, WINDOW_MINUTES: 60 },
    [ROLES.USER]: { REQUESTS: 200, WINDOW_MINUTES: 60 },
    [ROLES.GUEST]: { REQUESTS: 10, WINDOW_MINUTES: 60 },
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

  // INTEGRATION-ISSUE: Missing configuration to support propagation of usage information up the management chain.
  // FIX: Added a NOTIFICATIONS configuration object. This allows the application to trigger alerts to managers and admins when users approach or hit their usage limits, fulfilling a key hierarchical integration requirement.
  NOTIFICATIONS: {
    USAGE_WARNING_THRESHOLD_PERCENT: 80,
    USAGE_LIMIT_REACHED_THRESHOLD_PERCENT: 100,
  },

  // GCP-INTEGRATION: Added Pub/Sub topic configurations to support asynchronous, scalable offloading of background tasks.
  // This ensures that notification delivery and other long-running processes do not block the main application thread,
  // making the system more resilient and container-friendly.
  GCP_PUBSUB: {
    TOPICS: {
      USER_USAGE_WARNING: 'code-assistant-user-usage-warning',
      USER_USAGE_LIMIT_REACHED: 'code-assistant-user-usage-limit-reached',
    },
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