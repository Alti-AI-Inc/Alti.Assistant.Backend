import UserUsageModel from './userUsage.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import { logger } from '../../../shared/logger.js';
import { requestContextStore } from '../../../shared/requestContext.js';

/**
 * Extracts userId and tenantId from various user context formats.
 */
const extractContext = (userContext) => {
  let userId = null;
  let tenantId = null;

  if (userContext && typeof userContext === 'object') {
    userId = userContext.userId || userContext._id || userContext.id;
    tenantId = userContext.workspaceId || userContext.tenantId || userContext.currentTenantId;
  }

  // Fallback to request context store if not provided
  if (!userId) {
    try {
      const store = requestContextStore.getStore();
      if (store && store.req && store.req.user) {
        userId = store.req.user._id || store.req.user.id || store.req.user.userId;
        tenantId = tenantId || store.req.user.workspaceId || store.req.user.tenantId;
      }
    } catch (e) {
      // ignore
    }
  }

  return { userId, tenantId };
};

/**
 * Record user usage (increments daily request counter).
 */
export const recordUsage = async (...args) => {
  let userId = null;
  let tenantId = null;

  if (args.length === 1 && typeof args[0] === 'object') {
    const payload = args[0];
    userId = payload.userId;
    tenantId = payload.workspaceId || payload.tenantId;
  } else {
    const context = extractContext(args[0]);
    userId = context.userId;
    tenantId = context.tenantId;
  }

  if (!userId) return;

  try {
    await UserUsageModel.incrementRequest(userId, tenantId);
  } catch (err) {
    logger.error('Error in recordUsage:', err);
  }
};

/**
 * Check usage limit and throw error if limit is reached.
 */
export const checkUsageLimit = async (userContext, limitType) => {
  const { userId, tenantId } = extractContext(userContext);
  if (!userId) return;

  const filter = tenantId ? { tenantId } : { userId, tenantId: null };
  const subscription = await SubscriptionModel.findOne(filter);

  if (subscription) {
    if (typeof subscription.hasReachedLimit === 'function') {
      const limitKey = limitType.includes('search') ? 'webSearch' : (limitType.includes('research') ? 'deepResearch' : null);
      if (limitKey && subscription.hasReachedLimit(limitKey)) {
        throw new Error(`Usage limit reached for ${limitType}`);
      }
    }
  }
};

/**
 * Check usage limits (alias for checkUsageLimit).
 */
export const checkUsageLimits = checkUsageLimit;

/**
 * Check usage and limits (used in controllers like forum).
 */
export const checkUsageAndLimits = async (user, action, metadata) => {
  const userId = user?._id || user?.id;
  if (!userId) return;

  try {
    const [todayCount, subscription] = await Promise.all([
      UserUsageModel.getTodayRequests(userId, null),
      SubscriptionModel.findOne({ userId, tenantId: null }).lean(),
    ]);

    const limit = subscription?.limits?.dailyRequestLimit || 10;
    if (todayCount >= limit) {
      throw new Error('Daily request limit reached.');
    }
  } catch (err) {
    if (err.message.includes('limit reached')) throw err;
    logger.error('Error in checkUsageAndLimits:', err);
  }
};

/**
 * Check if user can make an API call (e.g. for massive service).
 */
export const canMakeApiCall = async (userContext, service, cost = 1) => {
  try {
    const { userId, tenantId } = extractContext(userContext);
    if (!userId) return true;

    const [todayCount, subscription] = await Promise.all([
      UserUsageModel.getTodayRequests(userId, tenantId),
      SubscriptionModel.findOne(tenantId ? { tenantId } : { userId, tenantId: null }).lean(),
    ]);

    const limit = subscription?.limits?.dailyRequestLimit || 10;
    return todayCount + cost <= limit;
  } catch (err) {
    logger.error('Error in canMakeApiCall:', err);
    return true; // Fail-open
  }
};

/**
 * Record an API call.
 */
export const recordApiCall = async (userContext, details) => {
  const { userId, tenantId } = extractContext(userContext);
  if (!userId) return;

  try {
    await UserUsageModel.incrementRequest(userId, tenantId);
  } catch (err) {
    logger.error('Error in recordApiCall:', err);
  }
};

/**
 * Check image generation limit.
 */
export const checkImageGenerationLimit = async (userContext) => {
  const { userId, tenantId } = extractContext(userContext);
  if (!userId) return;

  try {
    const filter = tenantId ? { tenantId } : { userId, tenantId: null };
    const subscription = await SubscriptionModel.findOne(filter).lean();
    if (subscription) {
      const imagesUsed = subscription.usage?.imagesUsed || 0;
      const limit = subscription.limits?.imagesLimit || 10;
      if (imagesUsed >= limit) {
        throw new Error('Image generation limit reached for your plan.');
      }
    }
  } catch (err) {
    if (err.message.includes('limit reached')) throw err;
    logger.error('Error in checkImageGenerationLimit:', err);
  }
};

/**
 * Record image generation.
 */
export const recordImageGeneration = async (userContext) => {
  const { userId, tenantId } = extractContext(userContext);
  if (!userId) return;

  try {
    const filter = tenantId ? { tenantId } : { userId, tenantId: null };
    await SubscriptionModel.updateOne(filter, { $inc: { 'usage.imagesUsed': 1 } });
  } catch (err) {
    logger.error('Error in recordImageGeneration:', err);
  }
};

/**
 * Check limit for a tenant and amount.
 */
export const checkLimit = async (tenantId, limitType, amount = 1) => {
  const subscription = await SubscriptionModel.findOne({ tenantId });
  if (subscription) {
    if (typeof subscription.hasReachedLimit === 'function') {
      const limitKey = limitType.includes('search') ? 'webSearch' : (limitType.includes('research') ? 'deepResearch' : null);
      if (limitKey && subscription.hasReachedLimit(limitKey)) {
        const err = new Error(`Usage limit reached for ${limitType}`);
        err.name = 'LimitExceededError';
        throw err;
      }
    }
  }
};

/**
 * Check limits helper for creative writing and similar.
 */
export const checkLimits = async (workspaceId, feature) => {
  try {
    await checkUsageLimit({ workspaceId }, feature);
    return true;
  } catch (err) {
    return false;
  }
};

/**
 * Tracks token/request usage and verifies limits (used by brainstormEngine).
 */
export const trackAndVerify = async ({ workspaceId, userId, feature, tokens }) => {
  await recordUsage({ userId, workspaceId });
  await checkUsageLimit({ userId, workspaceId }, feature);
};

// Object containing all service methods
export const usageService = {
  recordUsage,
  checkUsageLimit,
  checkUsageLimits,
  checkUsageAndLimits,
  canMakeApiCall,
  recordApiCall,
  checkImageGenerationLimit,
  recordImageGeneration,
  checkLimit,
  checkLimits,
  trackAndVerify,
};

export const UsageService = usageService;

// Default export
export default usageService;
