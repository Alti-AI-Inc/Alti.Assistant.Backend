import cron from 'node-cron';
import SubscriptionModel from '../../modules/subscription/subscription.model.js';
import { logger } from '../../../shared/logger.js';

/**
 * Daily Usage Reset Cron Job
 * Resets webSearchUsedToday and deepResearchUsedToday counters at midnight
 * Runs every day at 00:00 (midnight)
 */

let isRunning = false;

const resetDailyUsage = async () => {
  if (isRunning) {
    logger.warn('Daily usage reset already running, skipping...');
    return;
  }

  isRunning = true;

  try {
    logger.info('Starting daily usage reset...');

    const result = await SubscriptionModel.updateMany(
      { status: 'active' },
      {
        $set: {
          'usage.webSearchUsedToday': 0,
          'usage.deepResearchUsedToday': 0,
          'usage.lastResetAt': new Date(),
        },
      }
    );

    logger.info(
      `Daily usage reset completed: ${result.modifiedCount} active subscriptions updated`
    );

    // Also reset expired/cancelled subscriptions (in case they're reactivated)
    const allResult = await SubscriptionModel.updateMany(
      {},
      {
        $set: {
          'usage.lastResetAt': new Date(),
        },
      }
    );

    logger.info(`Updated lastResetAt for ${allResult.modifiedCount} total subscriptions`);
  } catch (error) {
    logger.error('Error resetting daily usage:', error);
  } finally {
    isRunning = false;
  }
};

/**
 * Schedule the cron job
 * Cron expression: '0 0 * * *' = Every day at midnight (00:00)
 * Timezone: UTC
 */
export const startDailyUsageResetCron = () => {
  // Run at midnight every day
  cron.schedule('0 0 * * *', resetDailyUsage, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info('Daily usage reset cron job scheduled (00:00 UTC)');

  // Optional: Run immediately on startup for testing
  // resetDailyUsage();
};

/**
 * Manual trigger for testing
 */
export const triggerDailyUsageReset = async () => {
  logger.info('Manually triggering daily usage reset...');
  await resetDailyUsage();
};

export default {
  startDailyUsageResetCron,
  triggerDailyUsageReset,
};
