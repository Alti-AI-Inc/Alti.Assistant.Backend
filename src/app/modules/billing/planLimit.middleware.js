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
      if (req.isGuest || req.user?.isGuest || !req.user) {
        return next();
      }

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

        return next();
      }

      // 4. Handle monthly metered features: research, image, video, task, workflow, search, write, code, projects, models, knowledge
      let resolvedLimitType = limitType;
      if (limitType === 'chatbot') {
        const isShared = req.body?.isShared === true || req.body?.isShared === 'true' || req.query?.isShared === 'true' || req.query?.isShared === true;
        resolvedLimitType = isShared ? 'models' : 'projects';
      } else if (limitType === 'search' && (req.body?.deepSearch === true || req.body?.deepSearch === 'true')) {
        resolvedLimitType = 'research';
      }

      const meteredFeatures = [
        'research', 'image', 'audio', 'video', 'task', 'workflow',
        'search', 'write', 'code', 'projects', 'models', 'knowledge'
      ];

      if (meteredFeatures.includes(resolvedLimitType)) {
        const tenantId = req.user?.tenantId || req.tenantId || null;
        
        // Dynamic import to avoid circular dependency
        const subscriptionService = (await import('../subscription/subscription.service.js')).default;
        const check = await subscriptionService.checkMonthlyUsageLimit(userId, tenantId, resolvedLimitType);

        if (!check.allowed) {
          return next(
            new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              check.message || `Monthly ${resolvedLimitType} limit reached. Please upgrade to continue.`
            )
          );
        }

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
