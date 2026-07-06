import SubscriptionModel from '../../modules/subscription/subscription.model.js';
import { logger } from '../../../shared/logger.js';

let isRunning = false;

export const resetDailyUsage = async (req, res) => {
  if (isRunning) {
    logger.warn('Daily usage reset already running, skipping...');
    if (res) res.status(409).json({ success: false, message: 'Already running' });
    return;
  }

  isRunning = true;

  try {
    logger.info('Starting daily usage reset (HTTP trigger)...');

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

    logger.info(`Daily usage reset completed: ${result.modifiedCount} active subscriptions updated`);

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
    if (res) res.status(200).json({ success: true, message: 'Daily usage reset completed', count: result.modifiedCount });
  } catch (error) {
    logger.error('Error resetting daily usage:', error);
    if (res) res.status(500).json({ success: false, message: error.message });
  } finally {
    isRunning = false;
  }
};

export default {
  resetDailyUsage,
};
