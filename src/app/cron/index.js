import { startDailyUsageResetCron } from './subscription/resetDailyUsage.js';
import { startStripeSyncCron } from './subscription/syncStripeSubscriptions.js';
import { logger } from '../../shared/logger.js';

/**
 * Initialize all cron jobs
 * Call this function from the main application entry point
 */
export const initializeCronJobs = () => {
  logger.info('Initializing cron jobs...');

  try {
    // Start daily usage reset (runs at midnight UTC)
    startDailyUsageResetCron();

    // Start Stripe sync (runs every hour)
    startStripeSyncCron();

    logger.info('All cron jobs initialized successfully');
  } catch (error) {
    logger.error('Error initializing cron jobs:', error);
  }
};

export default {
  initializeCronJobs,
};
