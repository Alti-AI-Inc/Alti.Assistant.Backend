import cron from 'node-cron';
import { logger } from '../../../shared/logger.js';
import UserUsageModel from '../../modules/usage/userUsage.model.js';
import SubscriptionModel from '../../modules/payment/payment.model.js';

/**
 * Cleanup Cron Job
 * Schedule: 0 2 * * * — runs at 2:00 AM UTC daily
 *
 * Tasks:
 * 1. Delete UserUsage documents older than 90 days
 * 2. Expire subscriptions where expiresAt < now
 */
cron.schedule('0 2 * * *', async () => {
  logger.info('[Cleanup Cron] Starting daily cleanup job');

  // ── 1. Delete UserUsage docs older than 90 days ──────────────────────────
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const usageResult = await UserUsageModel.deleteMany({
      date: { $lt: cutoff },
    });

    logger.info(
      `[Cleanup Cron] Deleted ${usageResult.deletedCount} UserUsage records older than 90 days`
    );
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

    logger.info(
      `[Cleanup Cron] Expired ${expireResult.modifiedCount} subscriptions`
    );
  } catch (err) {
    logger.error('[Cleanup Cron] Error expiring subscriptions:', err);
  }

  logger.info('[Cleanup Cron] Daily cleanup job complete');
});

logger.info('[Cleanup Cron] Daily cleanup cron job scheduled (0 2 * * *)');
