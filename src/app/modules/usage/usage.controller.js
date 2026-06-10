import catchAsync from '../../../shared/catchAsync.js';
import UserUsageModel from './userUsage.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

// Improvement: Centralize plan definitions, especially for the fallback "free" plan.
// This avoids hardcoding magic numbers and strings within the controller logic, making it easier to manage.
const PLAN_DEFINITIONS = {
  free: {
    name: 'free',
    limits: {
      dailyRequestLimit: 10,
      ragType: 'none',
      storagePerUser: 0, // 0 bytes
      canInviteTeam: false,
    },
  },
};

const getUsageStats = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized user session');
  }

  const tenantId = req.currentTenantId || null;

  // Find subscription (context-aware: personal or organization)
  const filter = tenantId ? { tenantId } : { userId, tenantId: null };
  // Optimization: Using .lean() for read-only queries reduces Mongoose document overhead.
  // Indexing Recommendation: For SubscriptionModel, ensure indexes on `tenantId` and `userId` exist.
  const subscription = await SubscriptionModel.findOne(filter).lean();

  // --- Subscription & Limits Logic Improvement ---
  // Determine the active plan and limits based on the subscription's existence and status.
  // This prevents users with inactive (e.g., 'past_due', 'canceled') subscriptions from accessing paid features.
  let activePlan;
  const activeSubscriptionStatuses = ['active', 'trialing'];

  if (subscription && activeSubscriptionStatuses.includes(subscription.paymentStatus)) {
    // If a valid, active subscription exists, use its limits.
    activePlan = {
      name: subscription.plan_name,
      status: subscription.paymentStatus,
      limits: subscription.limits,
    };
  } else {
    // Fallback to the free plan if no subscription exists or if it's not in an active state.
    activePlan = {
      name: PLAN_DEFINITIONS.free.name,
      // Report the actual subscription status if it exists, otherwise 'inactive'.
      status: subscription?.paymentStatus || 'inactive',
      limits: PLAN_DEFINITIONS.free.limits,
    };
  }

  const {
    name: planName,
    status: paymentStatus,
    limits,
  } = activePlan;
  // --- End of Improvement ---

  // Get daily usage details from UserUsage model
  // Indexing Recommendation: For UserUsageModel, ensure indexes on `userId`, `tenantId`, and `createdAt` exist.
  // Performance Improvement: Database queries for today's requests and total storage are run in parallel.
  const [todayCount, storageUsedBytes] = await Promise.all([
    UserUsageModel.getTodayRequests(userId, tenantId),
    UserUsageModel.getTotalStorage(userId, tenantId),
  ]);

  // Daily request limit details
  const dailyRequestLimit = limits.dailyRequestLimit;
  const remainingRequests = Math.max(0, dailyRequestLimit - todayCount);
  const percentageRequestsUsed =
    dailyRequestLimit > 0 ? (todayCount / dailyRequestLimit) * 100 : 0;

  // Storage limits details
  const storageLimitBytes = limits.storagePerUser || 0;
  const remainingStorageBytes = Math.max(
    0,
    storageLimitBytes - storageUsedBytes,
  );
  const percentageStorageUsed =
    storageLimitBytes > 0 ? (storageUsedBytes / storageLimitBytes) * 100 : 0;

  // Next UTC midnight reset time calculation
  const resetsAt = new Date();
  resetsAt.setUTCHours(24, 0, 0, 0);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Usage statistics retrieved successfully.',
    data: {
      plan: planName,
      status: paymentStatus,
      requestsUsedToday: todayCount,
      requestsLimit: dailyRequestLimit,
      remainingRequests,
      percentageRequestsUsed: parseFloat(percentageRequestsUsed.toFixed(2)),
      storageUsedBytes,
      storageLimitBytes,
      remainingStorageBytes,
      percentageStorageUsed: parseFloat(percentageStorageUsed.toFixed(2)),
      resetsAt,
      features: {
        ragType: limits.ragType,
        canInviteTeam: limits.canInviteTeam,
      },
    },
  });
});

export const usageController = {
  getUsageStats,
};