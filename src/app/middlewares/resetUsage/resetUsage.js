import cron from 'node-cron';
import SubscriptionModel from '../../modules/payment/payment.model.js';
import UserModel from '../../modules/auth/auth.model.js';

cron.schedule(
  '47 18 * * *', // Runs at 6:47 PM UTC (3:11 PM Bangladesh Time)
  // '30 2 * * *',  // Runs at 2:30 AM Bangladesh Time
  async () => {
    console.log(`⏳ Running scheduled task at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`);

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

    console.log(`✅ Reset prompts & images for ${activeSubscriptions.length} active subscriptions.`);

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

    console.log(`✅ Expired ${expiredSubscriptions.length} subscriptions.`);

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

    console.log('✅ Reset free plan usage for all users.');
  },
  {
    scheduled: true,
    timezone: 'Asia/Dhaka', // ⬅️ Ensure it runs in Bangladesh Time
  }
);