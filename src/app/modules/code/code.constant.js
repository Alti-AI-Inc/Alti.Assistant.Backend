/**
 * @fileoverview Constants and configuration settings for the Code Assistant module.
 * This file defines roles, subscription plans, workspace settings, Stripe configurations,
 * rate limits, conversation constraints, and other core application settings.
 * @module CodeAssistantConstants
 */

// BUG-FIX: The original USER_TYPES was too simplistic and did not account for the application's hierarchical role structure.
// FIX: Replaced USER_TYPES with a more granular ROLES object to support proper permissioning and feature flagging for super_admin, admin, manager, and user roles.
const ROLES = {
  SUPER_ADMIN: 'super_admin', // Platform owner with unrestricted access.
  ADMIN: 'admin',             // Workspace owner, manages billing, managers, and users.
  MANAGER: 'manager',         // Team lead, manages users within a workspace.
  USER: 'user',               // Standard authenticated user within a workspace.
  GUEST: 'guest',             // Unauthenticated user with limited access.
};

// ADMIN-FEATURE: Added constants for workspace configuration to centralize validation rules for name and slug updates.
// This ensures consistency and security when admins manage their workspace settings.
const WORKSPACE = {
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 50,
  SLUG_MIN_LENGTH: 3,
  SLUG_MAX_LENGTH: 50,
  // Enforces URL-safe slugs (lowercase, alphanumeric, single hyphens).
  SLUG_REGEX: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

// BILLING-FEATURE: Added Stripe constants to support secure subscription and billing management.
// This includes a whitelist of webhook events to process and standardized subscription statuses.
const STRIPE = {
  // A whitelist of Stripe webhook events to process. This is a security best practice to ignore unexpected or malicious events.
  WEBHOOK_EVENTS: {
    INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
    INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
    CUSTOMER_SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
    CUSTOMER_SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
    CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  },
  // Subscription statuses mirrored from Stripe for consistent internal state management.
  SUBSCRIPTION_STATUS: {
    ACTIVE: 'active',
    TRIALING: 'trialing',
    PAST_DUE: 'past_due',
    CANCELED: 'canceled',
    INCOMPLETE: 'incomplete',
    INCOMPLETE_EXPIRED: 'incomplete_expired',
  },
};

// BILLING-OPTIMIZATION: Introduced a structured subscription plan configuration.
// This allows admins to manage different tiers (Free, Pro, Enterprise) and ties workspace limits (users, requests)
// directly to the billing model, making the platform scalable and commercially viable.
const SUBSCRIPTION_PLANS = {
  FREE: {
    planId: 'free',
    name: 'Free',
    // The name of the environment variable holding the Stripe Price ID. Null for non-billable plans.
    stripePriceIdEnvVar: null,
    limits: {
      maxUsers: 5,
      monthlyRequestLimit: 10000,
      maxHistoryLength: 10,
    },
    features: {
      customBranding: false,
      prioritySupport: false,
    },
  },
  PRO: {
    planId: 'pro',
    name: 'Pro',
    stripePriceIdEnvVar: 'STRIPE_PRO_PLAN_PRICE_ID',
    limits: {
      maxUsers: 50,
      monthlyRequestLimit: 100000,
      maxHistoryLength: 50,
    },
    features: {
      customBranding: true,
      prioritySupport: true,
    },
  },
  ENTERPRISE: {
    planId: 'enterprise',
    name: 'Enterprise',
    stripePriceIdEnvVar: 'STRIPE_ENTERPRISE_PLAN_PRICE_ID',
    limits: {
      maxUsers: -1, // -1 signifies unlimited
      monthlyRequestLimit: -1, // -1 signifies unlimited
      maxHistoryLength: 100,
    },
    features: {
      customBranding: true,
      prioritySupport: true,
    },
  },
};

/**
 * Configuration constants for the Code Assistant module.
 * @type {Object}
 * @property {Object} ROLES Defines the user roles within the system.
 * @property {Object} WORKSPACE Defines validation and configuration for workspaces.
 * @property {Object} STRIPE Defines constants for Stripe integration, including webhook events and statuses.
 * @property {Object} SUBSCRIPTION_PLANS Defines the available subscription tiers and their associated limits and features.
 * @property {Object} RATE_LIMIT Per-user rate limiting configurations to prevent short-term abuse.
 * @property {Object} CONVERSATION Configuration limits for conversations.
 * @property {Object} MESSAGE Configuration limits and types for messages.
 * @property {Object} MODEL Configuration for the AI model used.
 * @property {Object} NOTIFICATIONS Configuration for usage-based notifications.
 * @property {Object} GCP_PUBSUB Configuration for Google Cloud Pub/Sub topics.
 * @property {Object} GUEST Configuration and feature flags for guest users.
 */
export const CODE_ASSISTANT_CONSTANTS = {
  ROLES,
  WORKSPACE,
  STRIPE,
  SUBSCRIPTION_PLANS,

  // HIERARCHY-GAP: The original rate limit was a flat value for all authenticated users, failing to respect the role hierarchy.
  // FIX: Implemented role-based rate limiting to provide granular control over usage for different user tiers. This is critical for managing tenant resources and preventing abuse.
  // NOTE: This is short-term, per-user rate limiting, distinct from the workspace's overall monthly quota defined in SUBSCRIPTION_PLANS.
  RATE_LIMIT: {
    [ROLES.SUPER_ADMIN]: { REQUESTS: -1, WINDOW_MINUTES: 1 }, // -1 signifies unlimited requests
    [ROLES.ADMIN]: { REQUESTS: 1000, WINDOW_MINUTES: 60 },
    [ROLES.MANAGER]: { REQUESTS: 500, WINDOW_MINUTES: 60 },
    [ROLES.USER]: { REQUESTS: 200, WINDOW_MINUTES: 60 },
    [ROLES.GUEST]: { REQUESTS: 10, WINDOW_MINUTES: 60 },
  },

  CONVERSATION: {
    // OPTIMIZATION: MAX_HISTORY_LENGTH is now defined per subscription plan to offer tiered benefits.
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
      // BILLING-FEATURE: Added topic for handling Stripe webhooks asynchronously.
      STRIPE_WEBHOOKS: 'stripe-webhooks',
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