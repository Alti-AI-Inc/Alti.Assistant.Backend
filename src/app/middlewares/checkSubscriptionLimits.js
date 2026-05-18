import subscriptionService from '../modules/subscription/subscription.service.js';
import ApiError from '../../errors/ApiError.js';
import httpStatus from 'http-status';
import { logger } from '../../shared/logger.js';

/**
 * Middleware to check subscription usage limits
 * Blocks requests when daily limits are reached and auto-increments usage
 */

/**
 * Generic limit checker
 * @param {string} limitType - 'webSearch' or 'deepResearch'
 */
const checkSubscriptionLimit = (limitType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?._id || req.user?.id;

      if (!userId) {
        return next(
          new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated')
        );
      }

      // Check limit
      const limitCheck = await subscriptionService.checkUsageLimit(
        userId,
        limitType
      );

      if (!limitCheck.allowed) {
        logger.warn(`User ${userId} reached ${limitType} limit`);
        return next(
          new ApiError(
            httpStatus.TOO_MANY_REQUESTS,
            `Daily ${limitType} limit reached (${limitCheck.limit}). Upgrade your plan to continue.`,
            {
              limit: limitCheck.limit,
              used: limitCheck.used,
              remaining: 0,
            }
          )
        );
      }

      // Increment usage asynchronously (don't wait or block)
      subscriptionService.incrementUsage(userId, limitType).catch((err) => {
        logger.error('Error incrementing usage:', err);
        // Don't fail the request if usage increment fails
      });

      // Attach remaining count to request for response headers
      req.usageRemaining = limitCheck.remaining;
      req.usageLimit = limitCheck.limit;
      req.usageUsed = limitCheck.used;

      next();
    } catch (error) {
      logger.error('Error checking subscription limit:', error);
      // On error, allow the request to proceed (fail open)
      // This prevents subscription service issues from blocking all requests
      next();
    }
  };
};

/**
 * Check web search daily limit
 * Apply to search endpoints
 */
export const checkWebSearchLimit = checkSubscriptionLimit('webSearch');

/**
 * Check deep research daily limit
 * Apply to deep research endpoints
 */
export const checkDeepResearchLimit = checkSubscriptionLimit('deepResearch');

export default {
  checkWebSearchLimit,
  checkDeepResearchLimit,
};
