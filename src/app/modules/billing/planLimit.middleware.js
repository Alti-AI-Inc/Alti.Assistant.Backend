import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Subscription from '../subscription/subscription.model.js';
import Tenant from '../tenant/tenant.model.js';

/**
 * Middleware to check subscription/plan limits (e.g. actions, team member slots)
 * Blocks requests when limits are reached
 * 
 * @param {'action' | 'members'} limitType - The limit type to check
 */
export const planLimitMiddleware = (limitType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?._id || req.user?.id;

      if (!userId) {
        return next(
          new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated')
        );
      }

      // 1. Fetch user's subscription
      let subscription = await Subscription.findByUser(userId);

      // If user has no active subscription but belongs to a tenant, look up tenant's subscription
      if (!subscription && req.user?.tenantId) {
        subscription = await Subscription.findOne({
          tenantId: req.user.tenantId,
          status: 'active',
        });
      }

      // 2. Handle 'members' limit type
      if (limitType === 'members') {
        if (!subscription) {
          return next(
            new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              'No active subscription found. Please upgrade to invite team members.'
            )
          );
        }

        if (subscription.plan === 'free' || !subscription.limits?.canInviteTeam) {
          return next(
            new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              'Your current plan does not support team members. Please upgrade to invite team members.'
            )
          );
        }

        // Check seat limits
        if (!subscription.limits?.unlimitedSeats && subscription.seats?.used >= subscription.seats?.total) {
          return next(
            new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              'Seat limit reached. Please purchase more seats on your billing page before inviting additional team members.'
            )
          );
        }

        // Also check tenant-level limit if tenantId is available
        const tenantId = subscription.tenantId || req.user?.tenantId;
        if (tenantId) {
          const tenant = await Tenant.findById(tenantId).lean();
          if (tenant && tenant.limits?.maxUsers && tenant.usage?.usersCount >= tenant.limits.maxUsers) {
            return next(
              new ApiError(
                httpStatus.PAYMENT_REQUIRED,
                'Tenant has reached the maximum user/member limit for this plan.'
              )
            );
          }
        }

        return next();
      }

      // 3. Handle 'action' limit type
      if (limitType === 'action') {
        // Under our subscription model:
        // Free plan has daily limits (we can check if we want to restrict actions for free plan).
        // Let's assume actions are allowed for paid plans, or if on free plan, they are metered / restricted.
        // For a fail-safe starting implementation, let's check:
        // If they are not on free plan (e.g. explore, execute, command), they are allowed.
        // If they don't have a subscription or are on free, we check if they exceeded free limits.
        // As a default standard, if they have an active paid subscription, let's allow it.
        // If they are on free plan or no subscription, let's restrict it or return 402 if we enforce payment.
        if (!subscription || subscription.plan === 'free') {
          return next(
            new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              'This action requires a paid subscription plan. Please upgrade to continue.'
            )
          );
        }

        // If subscription is suspended/past_due/etc.
        if (['past_due', 'unpaid', 'cancelled', 'suspended'].includes(subscription.status)) {
          return next(
            new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              'Your subscription is currently suspended or unpaid. Please update your billing details.'
            )
          );
        }

        // If we want to increment metered action limits in future, we can do that here.
        // For now, having an active paid subscription is sufficient.
        return next();
      }

      // Fallback for unknown limit type
      next();
    } catch (error) {
      logger.error(`Error in planLimitMiddleware for ${limitType}:`, error);
      // Fail open to avoid blocking user operations in case of database glitches
      next();
    }
  };
};

export default {
  planLimitMiddleware,
};
