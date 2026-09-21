import httpStatus from 'http-status';
import Subscription from '../modules/subscription/subscription.model.js';
import { getPromptLimit } from '../modules/subscription/plans.config.js';
import { logger } from '../../shared/logger.js';

/**
 * Prompt Rate Limiter Middleware
 *
 * Enforces monthly prompt limits per user based on their subscription plan.
 * 1 prompt = 1 input + 1 output (one round-trip).
 *
 * Usage: Apply to orchestrator routes:
 *   router.post('/orchestrate', auth(), promptLimiter, OrchestratorController.orchestrate);
 */
const promptLimiter = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.userId;
    if (!userId) {
      // No auth → let auth middleware handle it
      return next();
    }

    // Find active subscription
    const subscription = await Subscription.findByUser(userId);

    if (!subscription) {
      // No subscription → apply free tier limit
      return res.status(httpStatus.PAYMENT_REQUIRED).json({
        success: false,
        message: 'No active subscription. Please subscribe to a plan.',
        data: {
          promptsUsed: 0,
          promptLimit: 0,
          promptsRemaining: 0,
          plan: null,
        },
      });
    }

    // Ensure promptLimit is set from plan config
    if (!subscription.limits.promptLimit || subscription.limits.promptLimit === 25) {
      const planLimit = getPromptLimit(subscription.plan);
      if (planLimit !== subscription.limits.promptLimit) {
        subscription.limits.promptLimit = planLimit;
      }
    }

    // Check if limit reached
    if (subscription.hasReachedPromptLimit()) {
      const usageInfo = subscription.getPromptUsageInfo();
      logger.warn(`[PromptLimiter] User ${userId} exceeded prompt limit: ${usageInfo.used}/${usageInfo.limit}`);

      return res.status(httpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        message: `Monthly prompt limit reached (${usageInfo.used}/${usageInfo.limit}). Upgrade your plan for more prompts.`,
        errorCode: 'PROMPT_LIMIT_EXCEEDED',
        data: {
          ...usageInfo,
          plan: subscription.plan,
          billingCycleEnd: subscription.billingCycle?.currentPeriodEnd,
        },
      });
    }

    // Attach subscription to request for downstream use
    req.subscription = subscription;
    req.promptUsage = subscription.getPromptUsageInfo();

    // Increment AFTER response completes (so failed requests aren't counted)
    const originalEnd = res.end;
    res.end = function (...args) {
      // Only count successful prompts (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        subscription.incrementPromptUsage().catch(err => {
          logger.warn(`[PromptLimiter] Failed to increment usage: ${err.message}`);
        });
      }
      originalEnd.apply(res, args);
    };

    next();
  } catch (err) {
    logger.error(`[PromptLimiter] Error: ${err.message}`);
    // Don't block requests on limiter errors — fail open
    next();
  }
};

/**
 * Lightweight prompt check (no enforcement, just attaches usage info).
 * Use on read-only endpoints that need to show usage.
 */
export const promptUsageInfo = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.userId;
    if (!userId) return next();

    const subscription = await Subscription.findByUser(userId);
    if (subscription) {
      req.promptUsage = subscription.getPromptUsageInfo();
      req.subscription = subscription;
    }
    next();
  } catch {
    next();
  }
};

export default promptLimiter;
