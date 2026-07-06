import { logger } from '../../../shared/logger.js';
import UserUsageModel from '../../modules/usage/userUsage.model.js';
import SubscriptionModel from '../../modules/payment/payment.model.js';

export const cleanupOldUsage = async (req, res) => {
  logger.info('[Cleanup Cron] Starting daily cleanup job (HTTP trigger)');

  let deletedUsage = 0;
  let expiredSubs = 0;

  // ── 1. Delete UserUsage docs older than 90 days ──────────────────────────
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const usageResult = await UserUsageModel.deleteMany({
      date: { $lt: cutoff },
    });

    deletedUsage = usageResult.deletedCount;
    logger.info(`[Cleanup Cron] Deleted ${deletedUsage} UserUsage records older than 90 days`);
  } catch (err) {
    logger.error('[Cleanup Cron] Error deleting old UserUsage records:', err);
  }

  // ── 2. Expire subscriptions where expiresAt < now ─────────────────────────
  try {
    const expireResult = await SubscriptionModel.updateMany(
      {
        paymentStatus: 'paid',
        expiresAt: { $lt: new Date() },
      },
      {
        $set: { paymentStatus: 'expired' },
      }
    );

    expiredSubs = expireResult.modifiedCount;
    logger.info(`[Cleanup Cron] Expired ${expiredSubs} subscriptions`);
  } catch (err) {
    logger.error('[Cleanup Cron] Error expiring subscriptions:', err);
  }

  logger.info('[Cleanup Cron] Daily cleanup job complete');
  if (res) res.status(200).json({ success: true, message: 'Cleanup complete', deletedUsage, expiredSubs });
};
