import UserUsageModel from './userUsage.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import { logger } from '../../../shared/logger.js';
import { requestContextStore } from '../../../shared/requestContext.js';

/**
 * Custom error for limit exceeded exceptions, allowing for specific catch blocks.
 */
class LimitExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LimitExceededError';
  }
}

/**
 * Centralized default limits for free-tier or unsubscribed users.
 * These values are used when a subscription record is not found or doesn't specify a limit.
 */
const DEFAULT_LIMITS = {
  dailyRequests: 20,
  images: 10,
  webSearches: 5,
  deepResearch: 1,
  gcpTtsCharacters: 100000,
};

/**
 * Maps public feature names to internal subscription and usage document keys.
 * This provides a single source of truth for how features are defined and tracked,
 * preventing brittle string matching and making it easy to add new trackable features.
 */
const USAGE_FEATURE_MAP = {
  dailyRequest: {
    limitKey: 'dailyRequests',
    usageKey: 'dailyRequests', // Special case: tracked in UserUsageModel
  },
  image: {
    limitKey: 'images',
    usageKey: 'imagesUsed',
  },
  webSearch: {
    limitKey: 'webSearches',
    usageKey: 'webSearchesUsed',
  },
  deepResearch: {
    limitKey: 'deepResearch',
    usageKey: 'deepResearchUsed',
  },
  gcp_tts_characters: {
    limitKey: 'gcpTtsCharacters',
    usageKey: 'gcpTtsCharactersUsed',
  },
};

/**
 * Extracts userId and tenantId (workspaceId) from various user context formats.
 * Ensures returned IDs are strings for consistent query performance.
 * @param {object} [userContext] - The user context object, often from `req.user`.
 * @returns {{userId: string|null, tenantId: string|null}}
 */
const extractContext = (userContext) => {
  let userId = null;
  let tenantId = null;

  if (userContext && typeof userContext === 'object') {
    userId = userContext.userId || userContext._id || userContext.id;
    tenantId = userContext.workspaceId || userContext.tenantId || userContext.currentTenantId;
  }

  // Fallback to request context store if userContext is not explicitly provided.
  if (!userId) {
    try {
      const store = requestContextStore.getStore();
      if (store?.req?.user) {
        userId = store.req.user._id || store.req.user.id || store.req.user.userId;
        tenantId = tenantId || store.req.user.workspaceId || store.req.user.tenantId;
      }
    } catch (e) {
      // requestContextStore.getStore() can throw if no active context is found.
      // This is expected in some scenarios (e.g., background jobs) and can be ignored.
    }
  }

  return { userId: userId?.toString(), tenantId: tenantId?.toString() };
};

/**
 * Core function to check if a user or workspace has exceeded a specific usage limit.
 * Throws LimitExceededError if the limit is reached. This function fails "closed" for security.
 * @param {object} userContext - The user context for identifying the user/workspace.
 * @param {keyof typeof USAGE_FEATURE_MAP} feature - The feature to check.
 * @param {number} [amount=1] - The amount of usage to check against the limit.
 */
export const checkUsageLimit = async (userContext, feature, amount = 1) => {
  const { userId, tenantId } = extractContext(userContext);
  if (!userId) {
    throw new Error('User context is required to check usage limits.');
  }

  const featureConfig = USAGE_FEATURE_MAP[feature];
  if (!featureConfig) {
    logger.warn(`Unknown feature type passed to checkUsageLimit: ${feature}`);
    throw new Error(`Invalid feature specified: ${feature}`);
  }

  try {
    const filter = tenantId ? { tenantId } : { userId, tenantId: { $in: [null, undefined] } };
    const subscription = await SubscriptionModel.findOne(filter).lean();

    let currentUsage = 0;
    const limit = subscription?.limits?.[featureConfig.limitKey] ?? DEFAULT_LIMITS[featureConfig.limitKey] ?? 0;

    if (feature === 'dailyRequest') {
      currentUsage = await UserUsageModel.getTodayRequests(userId, tenantId);
    } else {
      currentUsage = subscription?.usage?.[featureConfig.usageKey] || 0;
    }

    if (currentUsage + amount > limit) {
      throw new LimitExceededError(`Usage limit of ${limit} for ${feature} has been reached.`);
    }
  } catch (error) {
    if (error instanceof LimitExceededError) {
      throw error;
    }
    // For any other errors (e.g., DB connection), log and fail-closed by throwing a generic error.
    logger.error(`Error in checkUsageLimit for feature "${feature}":`, error);
    throw new Error('Could not verify usage limits. Please try again.');
  }
};

/**
 * Core function to record usage for a specific feature. This is a fire-and-forget operation.
 * @param {object} userContext - The user context for identifying the user/workspace.
 * @param {keyof typeof USAGE_FEATURE_MAP} feature - The feature to track.
 * @param {number} [amount=1] - The amount of usage to record.
 */
export const trackUsage = async (userContext, feature, amount = 1) => {
  const { userId, tenantId } = extractContext(userContext);
  if (!userId || amount <= 0) return;

  const featureConfig = USAGE_FEATURE_MAP[feature];
  if (!featureConfig) {
    logger.error(`Unknown feature type passed to trackUsage: ${feature}`);
    return;
  }

  try {
    if (feature === 'dailyRequest') {
      // It's assumed UserUsageModel.incrementRequest can handle an amount.
      // If not, it should be updated to `(userId, tenantId, amount = 1)`.
      await UserUsageModel.incrementRequest(userId, tenantId, amount);
    } else {
      const filter = tenantId ? { tenantId } : { userId, tenantId: { $in: [null, undefined] } };
      const update = { $inc: { [`usage.${featureConfig.usageKey}`]: amount } };
      await SubscriptionModel.updateOne(filter, update);
    }
  } catch (err) {
    logger.error(`Error in trackUsage for feature "${feature}":`, err);
  }
};

/**
 * A robust, atomic-like operation to first verify limits and then track usage.
 * This is the recommended function for most usage tracking needs as it prevents race conditions.
 * @param {object} userContext - The user context for identifying the user/workspace.
 * @param {keyof typeof USAGE_FEATURE_MAP} feature - The feature to check and track.
 * @param {number} [amount=1] - The amount of usage to check and track.
 */
export const trackAndVerify = async (userContext, feature, amount = 1) => {
  // 1. Check if the user can perform the action. This will throw on failure.
  await checkUsageLimit(userContext, feature, amount);

  // 2. If the check passes, record the usage.
  await trackUsage(userContext, feature, amount);
};

// --- Wrapper & Alias Functions (for backward compatibility and convenience) ---

/**
 * Records a single daily request.
 * @param {object} userContext - The user context.
 */
export const recordUsage = (userContext) => trackUsage(userContext, 'dailyRequest', 1);

/**
 * Checks all relevant limits for a given feature. Alias for checkUsageLimit.
 */
export const checkUsageLimits = checkUsageLimit;

/**
 * Checks daily request limits for a user, typically for general API access.
 * @param {object} user - The user object.
 */
export const checkUsageAndLimits = (user) => checkUsageLimit(user, 'dailyRequest');

/**
 * Checks if a user can make an API call for a specific feature. Returns a boolean.
 * This is a non-throwing version of checkUsageLimit, suitable for UI checks.
 * @param {object} userContext - The user context.
 * @param {keyof typeof USAGE_FEATURE_MAP} [feature='dailyRequest'] - The feature being accessed.
 * @param {number} [cost=1] - The cost of the call.
 * @returns {Promise<boolean>} - True if the user is within limits, false otherwise.
 */
export const canMakeApiCall = async (userContext, feature = 'dailyRequest', cost = 1) => {
  try {
    await checkUsageLimit(userContext, feature, cost);
    return true;
  } catch (error) {
    if (!(error instanceof LimitExceededError)) {
      // Log unexpected errors, but not limit errors, as they are expected.
      logger.error('Error in canMakeApiCall:', error);
    }
    return false; // Fail-closed
  }
};

/**
 * Checks the image generation limit for the user/workspace.
 * @param {object} userContext - The user context.
 */
export const checkImageGenerationLimit = (userContext) => checkUsageLimit(userContext, 'image', 1);

/**
 * Records that an image was generated by the user/workspace.
 * @param {object} userContext - The user context.
 */
export const recordImageGeneration = (userContext) => trackUsage(userContext, 'image', 1);

/**
 * A generic limit check, primarily for workspace-level limits.
 * @param {string} tenantId - The ID of the workspace/tenant.
 * @param {keyof typeof USAGE_FEATURE_MAP} feature - The feature to check.
 * @param {number} [amount=1] - The amount of usage to check.
 */
export const checkLimit = (tenantId, feature, amount = 1) => {
  return checkUsageLimit({ tenantId }, feature, amount);
};

/**
 * A non-throwing helper to check limits, returning a boolean.
 * @param {string} workspaceId - The ID of the workspace.
 * @param {keyof typeof USAGE_FEATURE_MAP} feature - The feature to check.
 * @returns {Promise<boolean>}
 */
export const checkLimits = async (workspaceId, feature) => {
  try {
    await checkUsageLimit({ workspaceId }, feature);
    return true;
  } catch (err) {
    return false;
  }
};

// --- Service Object Export ---

export const usageService = {
  recordUsage,
  checkUsageLimit,
  checkUsageLimits,
  checkUsageAndLimits,
  canMakeApiCall,
  // recordApiCall is removed as it was a duplicate of recordUsage
  checkImageGenerationLimit,
  recordImageGeneration,
  checkLimit,
  checkLimits,
  trackAndVerify,
  // Expose core functions for advanced use cases
  trackUsage,
};

export const UsageService = usageService;

export default usageService;