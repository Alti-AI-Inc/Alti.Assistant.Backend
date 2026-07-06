import SubscriptionModel from '../../modules/payment/payment.model.js';
import UserModel from '../../modules/auth/auth.model.js';
import { logger } from '../../../shared/logger.js';

export const resetAllUsage = async (req, res) => {
  try {
    logger.info(`⏳ Running scheduled resetAllUsage task (HTTP trigger)`);

    // ✅ 1. Reset daily usage for all active subscriptions (paid & not expired)
    const activeSubscriptions = await SubscriptionModel.find({
      paymentStatus: 'paid',
      expiresAt: { $gte: new Date() }, // Only active subscriptions
    });

    for (const subscription of activeSubscriptions) {
      subscription.usage.promptsUsed = 0;
      subscription.usage.imagesUsed = 0;
      await subscription.save();
    }

    logger.info(`✅ Reset prompts & images for ${activeSubscriptions.length} active subscriptions.`);

    // ✅ 2. Expire subscriptions that have reached their expiry date:-
    const expiredSubscriptions = await SubscriptionModel.find({
      paymentStatus: 'paid',
      expiresAt: { $lt: new Date() }, // Subscriptions that have expired
    });

    for (const subscription of expiredSubscriptions) {
      subscription.paymentStatus = 'expired';
      await subscription.save();

      // ✅ Update User Model to reflect expired subscription
      await UserModel.findOneAndUpdate(
        { _id: subscription.userId },
        { isSubscribed: false, 'subscription.status': 'expired' }
      );
    }

    logger.info(`✅ Expired ${expiredSubscriptions.length} subscriptions.`);

    // ✅ 3. Reset free plan usage for all users
    await UserModel.updateMany(
      {},
      {
        $set: {
          'freePlanUsage.promptsUsed': 0,
          'freePlanUsage.imagesUsed': 0,
          'freePlanUsage.lastResetAt': new Date(),
        },
      }
    );

    logger.info('✅ Reset free plan usage for all users.');

    // ✅ 4. Reset daily request limits for all users at midnight
    await UserModel.updateMany(
      {},
      {
        $set: {
          'dailyRequestLimit.requestsUsed': 0,
          'dailyRequestLimit.lastResetAt': new Date(),
        },
      }
    );

    logger.info('✅ Reset daily request limits for all users.');

    if (res) res.status(200).json({ success: true, message: 'All usage reset successfully' });
  } catch (error) {
    logger.error('Error resetting all usage:', error);
    if (res) res.status(500).json({ success: false, message: error.message });
  }
};
