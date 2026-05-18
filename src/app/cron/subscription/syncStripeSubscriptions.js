import cron from 'node-cron';
import Stripe from 'stripe';
import config from '../../../../config/index.js';
import SubscriptionModel from '../../modules/subscription/subscription.model.js';
import subscriptionService from '../../modules/subscription/subscription.service.js';
import { logger } from '../../../shared/logger.js';

const stripe = new Stripe(config.stripe.stripe_secret_key);

/**
 * Stripe Subscription Sync Cron Job
 * Syncs database subscriptions with Stripe to catch any missed webhooks
 * Runs every hour
 */

let isRunning = false;

const syncStripeSubscriptions = async () => {
  if (isRunning) {
    logger.warn('Stripe sync already running, skipping...');
    return;
  }

  isRunning = true;

  try {
    logger.info('Starting Stripe subscription sync...');

    // Get all active subscriptions from database
    const dbSubscriptions = await SubscriptionModel.find({
      stripeSubscriptionId: { $exists: true, $ne: null },
      status: { $in: ['active', 'past_due', 'trialing'] },
    });

    let synced = 0;
    let errors = 0;
    let updated = 0;

    for (const dbSub of dbSubscriptions) {
      try {
        // Fetch subscription from Stripe
        const stripeSub = await stripe.subscriptions.retrieve(
          dbSub.stripeSubscriptionId
        );

        // Check for discrepancies
        let needsUpdate = false;
        const updates = {};

        // Status mismatch
        if (stripeSub.status !== dbSub.status) {
          logger.warn(
            `Status mismatch for subscription ${dbSub._id}: DB=${dbSub.status}, Stripe=${stripeSub.status}`
          );
          needsUpdate = true;
          updates.status = stripeSub.status;
        }

        // Quantity mismatch
        const stripeQuantity = stripeSub.items.data[0].quantity;
        if (stripeQuantity !== dbSub.seats.used) {
          logger.warn(
            `Quantity mismatch for subscription ${dbSub._id}: DB=${dbSub.seats.used}, Stripe=${stripeQuantity}`
          );
          needsUpdate = true;
          updates['seats.total'] = stripeQuantity;
          updates['seats.used'] = stripeQuantity;
        }

        // Billing period mismatch
        const stripePeriodEnd = new Date(stripeSub.current_period_end * 1000);
        const dbPeriodEnd = dbSub.billingCycle.currentPeriodEnd;

        if (Math.abs(stripePeriodEnd - dbPeriodEnd) > 1000) {
          // Allow 1 second difference
          logger.warn(`Billing period mismatch for subscription ${dbSub._id}`);
          needsUpdate = true;
          updates['billingCycle.currentPeriodStart'] = new Date(
            stripeSub.current_period_start * 1000
          );
          updates['billingCycle.currentPeriodEnd'] = stripePeriodEnd;
        }

        // Update if needed
        if (needsUpdate) {
          await SubscriptionModel.findByIdAndUpdate(dbSub._id, updates);
          logger.info(`Updated subscription ${dbSub._id} with Stripe data`);
          updated++;
        }

        synced++;
      } catch (error) {
        logger.error(`Error syncing subscription ${dbSub._id}:`, error.message);
        errors++;

        // If subscription not found in Stripe, mark as cancelled
        if (error.code === 'resource_missing') {
          await SubscriptionModel.findByIdAndUpdate(dbSub._id, {
            status: 'cancelled',
            'billingCycle.canceledAt': new Date(),
          });
          logger.warn(
            `Subscription ${dbSub._id} not found in Stripe, marked as cancelled`
          );
        }
      }
    }

    logger.info(
      `Stripe sync completed: ${synced} checked, ${updated} updated, ${errors} errors`
    );
  } catch (error) {
    logger.error('Error during Stripe sync:', error);
  } finally {
    isRunning = false;
  }
};

/**
 * Schedule the cron job
 * Cron expression: '0 * * * *' = Every hour at minute 0
 * Timezone: UTC
 */
export const startStripeSyncCron = () => {
  // Run every hour
  cron.schedule('0 * * * *', syncStripeSubscriptions, {
    scheduled: true,
    timezone: 'UTC',
  });

  logger.info(
    'Stripe subscription sync cron job scheduled (every hour at :00)'
  );

  // Optional: Run on startup after 5 minutes
  // setTimeout(() => {
  //   syncStripeSubscriptions();
  // }, 5 * 60 * 1000);
};

/**
 * Manual trigger for testing
 */
export const triggerStripeSync = async () => {
  logger.info('Manually triggering Stripe sync...');
  await syncStripeSubscriptions();
};

export default {
  startStripeSyncCron,
  triggerStripeSync,
};
