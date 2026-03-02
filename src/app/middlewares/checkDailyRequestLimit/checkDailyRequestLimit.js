import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import SubscriptionModel from '../../modules/payment/payment.model.js';
import UserUsageModel from '../../modules/usage/userUsage.model.js';
import { logger } from '../../../shared/logger.js';

const FREE_PLAN_DAILY_LIMIT = 10;

/**
 * Middleware to enforce daily request limits based on the user's active subscription.
 *
 * - Reads plan limits from SubscriptionModel (limits.dailyRequestLimit)
 * - Reads / increments daily usage from UserUsageModel (one doc per user per day)
 * - Supports both personal mode (tenantId = null) and org mode (tenantId = ObjectId)
 * - No manual reset logic needed — new UTC day = new UserUsage document automatically
 */
const checkDailyRequestLimit = async (req, res, next) => {
  try {
    console.log('Checking daily request limit for user:', req.user._id, req.isGuest, !req.user._id);
    // Skip check for guests / unauthenticated
    if (req.isGuest || !req.user._id) {
      return next();
    }

    const userId = req.user._id;
    const tenantId = req.currentTenantId ?? null; // null = personal mode

    // ── 1. Get the active subscription for the right context ──────────────────
    const subscription = await SubscriptionModel.findOne(
      tenantId
        ? { tenantId, paymentStatus: 'paid' }
        : { userId, tenantId: null, paymentStatus: 'paid' }
    );

    const dailyLimit = subscription?.limits?.dailyRequestLimit ?? FREE_PLAN_DAILY_LIMIT;
    const planName = subscription?.plan_name ?? 'free';
    console.log(`User ${userId} on plan ${planName} has a daily request limit of ${dailyLimit}`);
    // ── 2. Get today's request count from UserUsage ───────────────────────────
    const todayCount = await UserUsageModel.getTodayRequests(userId, tenantId);

    // ── 3. Enforce limit ──────────────────────────────────────────────────────
    if (todayCount >= dailyLimit) {
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      tomorrow.setUTCHours(0, 0, 0, 0);

      logger.warn(`Daily limit reached for user ${userId} (plan: ${planName}) — ${todayCount}/${dailyLimit}`);

      throw new ApiError(
        httpStatus.TOO_MANY_REQUESTS,
        `Daily request limit reached. You have used ${todayCount} of ${dailyLimit} requests today. ` +
        `Your limit resets at midnight UTC. ` +
        (planName === 'free'
          ? 'Upgrade to Explore ($20/mo) for 1,000 requests/day.'
          : `Your current plan: ${planName}.`)
      );
    }

    // ── 4. Increment usage ────────────────────────────────────────────────────
    await UserUsageModel.incrementRequest(userId, tenantId);
    const used = todayCount + 1;

    logger.info(`Request usage — user: ${userId}, plan: ${planName}, used: ${used}/${dailyLimit}`);

    // ── 5. Set info headers for the client ────────────────────────────────────
    res.setHeader('X-Daily-Requests-Used', used);
    res.setHeader('X-Daily-Requests-Limit', dailyLimit);
    res.setHeader('X-Daily-Requests-Remaining', Math.max(0, dailyLimit - used));

    next();
  } catch (error) {
    next(error);
  }
};

export default checkDailyRequestLimit;

