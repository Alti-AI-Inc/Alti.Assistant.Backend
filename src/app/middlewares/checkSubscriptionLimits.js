import subscriptionService from '../modules/subscription/subscription.service.js';
import ApiError from '../../errors/ApiError.js';
import httpStatus from 'http-status';
import { logger } from '../../shared/logger.js';

/**
 * Middleware to check subscription usage limits
 * Blocks requests when limits are reached
 */

/**
 * Check web search daily limit
 */
export const checkWebSearchLimit = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated'));
    }

    const limitCheck = await subscriptionService.checkUsageLimit(userId, 'webSearch');

    if (!limitCheck.allowed) {
      logger.warn(`User ${userId} reached webSearch limit`);
      return next(
        new ApiError(
          httpStatus.TOO_MANY_REQUESTS,
          `Daily webSearch limit reached (${limitCheck.limit}). Upgrade your plan to continue.`
        )
      );
    }

    subscriptionService.incrementUsage(userId, 'webSearch').catch((err) => {
      logger.error('Error incrementing webSearch usage:', err);
    });

    next();
  } catch (error) {
    logger.error('Error checking web search limit:', error);
    next();
  }
};

/**
 * Check deep research monthly limit and handle metered billing overages
 */
export const checkDeepResearchLimit = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated'));
    }

    const tenantId = req.user?.tenantId || req.tenantId || null;

    const check = await subscriptionService.checkMonthlyUsageLimit(userId, tenantId, 'research');

    if (!check.allowed) {
      logger.warn(`User ${userId} / tenant ${tenantId} reached monthly deep research limit`);
      return next(
        new ApiError(
          httpStatus.PAYMENT_REQUIRED,
          `Monthly deep research limit reached (${check.limit}). Please upgrade your plan to continue.`
        )
      );
    }

    // Increment usage and track overage
    subscriptionService.trackAndIncrementMonthlyUsage(userId, tenantId, 'research').catch((err) => {
      logger.error('Error tracking deep research usage:', err);
    });

    next();
  } catch (error) {
    logger.error('Error in checkDeepResearchLimit middleware:', error);
    next();
  }
};

export default {
  checkWebSearchLimit,
  checkDeepResearchLimit,
};
