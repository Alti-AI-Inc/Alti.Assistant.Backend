import catchAsync from '../../../shared/catchAsync.js';
import UserUsageModel from './userUsage.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

const getUsageStats = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized user session');
  }

  const tenantId = req.currentTenantId || null;

  // Find subscription (context-aware: personal or organization)
  const filter = tenantId ? { tenantId } : { userId, tenantId: null };
  // Optimization: Add .lean() for read-only queries to reduce Mongoose document overhead.
  // Indexing Recommendation: For SubscriptionModel, consider creating indexes on `tenantId` and `userId`
  // to improve query performance for `findOne(filter)`. A compound index `userId, tenantId` might also be beneficial.
  const subscription = await SubscriptionModel.findOne(filter).lean();

  // Fallback limits if no active paid subscription exists (Free plan limits)
  const planName = subscription?.plan_name || 'free';
  const paymentStatus = subscription?.paymentStatus || 'active';
  const limits = subscription?.limits || {
    dailyRequestLimit: 10,
    ragType: 'none',
    storagePerUser: 0,
    canInviteTeam: false,
  };

  // Get daily usage details from UserUsage model
  // Indexing Recommendation: For UserUsageModel, consider creating indexes on `userId`, `tenantId`,
  // and any timestamp/date field used for filtering (e.g., `createdAt`) to optimize `getTodayRequests`
  // and `getTotalStorage` methods.
  // Performance Improvement: Run database queries for today's requests and total storage in parallel.
  const [todayCount, storageUsedBytes] = await Promise.all([
    UserUsageModel.getTodayRequests(userId, tenantId),
    UserUsageModel.getTotalStorage(userId, tenantId),
  ]);

  // Daily request limit details
  const dailyRequestLimit = limits.dailyRequestLimit;
  const remainingRequests = Math.max(0, dailyRequestLimit - todayCount);
  const percentageRequestsUsed = dailyRequestLimit > 0 ? (todayCount / dailyRequestLimit) * 100 : 0;

  // Storage limits details
  const storageLimitBytes = limits.storagePerUser || 0;
  const remainingStorageBytes = Math.max(0, storageLimitBytes - storageUsedBytes);
  const percentageStorageUsed = storageLimitBytes > 0 ? (storageUsedBytes / storageLimitBytes) * 100 : 0;

  // Next UTC midnight reset time calculation
  const resetsAt = new Date();
  resetsAt.setUTCHours(24, 0, 0, 0);

  res.send({
    success: true,
    data: {
      plan: planName,
      status: paymentStatus,
      requestsUsedToday: todayCount,
      requestsLimit: dailyRequestLimit,
      remainingRequests,
      percentageRequestsUsed,
      storageUsedBytes,
      storageLimitBytes,
      remainingStorageBytes,
      percentageStorageUsed,
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