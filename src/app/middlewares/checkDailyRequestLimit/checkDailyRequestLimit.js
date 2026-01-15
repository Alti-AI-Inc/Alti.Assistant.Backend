import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import UserModel from '../../modules/auth/auth.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Middleware to check and enforce daily request limits for authenticated users
 * This applies to all conversational API endpoints
 * Users can make up to 10 requests per day across all conversational APIs
 */
const checkDailyRequestLimit = async (req, res, next) => {
  try {
    // Skip check for guest users
    if (req.isGuest || !req.user || !req.user.id) {
      return next();
    }

    const userId = req.user.id;

    // Fetch user from database
    const user = await UserModel.findById(userId);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check if user has an active subscription - subscribed users have unlimited requests
    if (user.isSubscribed && user.subscription && user.subscription.status === 'paid') {
      logger.info(`User ${userId} has active subscription, bypassing daily limit`);
      return next();
    }

    // Initialize dailyRequestLimit if it doesn't exist (for existing users)
    if (!user.dailyRequestLimit) {
      user.dailyRequestLimit = {
        requestsUsed: 0,
        maxRequests: 10,
        lastResetAt: new Date(),
      };
    }

    // Check if we need to reset the counter (new day)
    const now = new Date();
    const lastReset = new Date(user.dailyRequestLimit.lastResetAt);

    // Reset if it's a new day (after midnight)
    if (now.toDateString() !== lastReset.toDateString()) {
      user.dailyRequestLimit.requestsUsed = 0;
      user.dailyRequestLimit.lastResetAt = now;
      logger.info(`Reset daily request limit for user ${userId}`);
    }

    // Check if user has exceeded the daily limit
    if (user.dailyRequestLimit.requestsUsed >= user.dailyRequestLimit.maxRequests) {
      const resetTime = new Date(lastReset);
      resetTime.setDate(resetTime.getDate() + 1);
      resetTime.setHours(0, 0, 0, 0);

      throw new ApiError(
        httpStatus.TOO_MANY_REQUESTS,
        `Daily request limit exceeded. You have used ${user.dailyRequestLimit.requestsUsed} out of ${user.dailyRequestLimit.maxRequests} requests today. Your limit will reset at midnight. Consider upgrading to a paid plan for unlimited requests.`
      );
    }

    // Increment the request count
    user.dailyRequestLimit.requestsUsed += 1;
    await user.save();

    logger.info(
      `User ${userId} request count: ${user.dailyRequestLimit.requestsUsed}/${user.dailyRequestLimit.maxRequests}`
    );

    // Attach remaining requests to response header for client information
    res.setHeader('X-Daily-Requests-Used', user.dailyRequestLimit.requestsUsed);
    res.setHeader('X-Daily-Requests-Limit', user.dailyRequestLimit.maxRequests);
    res.setHeader('X-Daily-Requests-Remaining', user.dailyRequestLimit.maxRequests - user.dailyRequestLimit.requestsUsed);

    next();
  } catch (error) {
    next(error);
  }
};

export default checkDailyRequestLimit;
