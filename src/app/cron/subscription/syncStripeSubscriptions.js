import cron from 'node-cron';
import Stripe from 'stripe';
import config from '../../../../config/index.js';
import SubscriptionModel from '../../modules/subscription/subscription.model.js';
import subscriptionService from '../../modules/subscription/subscription.service.js';
import { logger } from '../../../shared/logger.js';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS_THRESHOLD = 3;

const isStripeOutageError = (err) => {
  if (!err) return false;
  const isConnection = err.type === 'StripeConnectionError';
  const isRateLimit = err.type === 'StripeRateLimitError';
  const is5xx = err.statusCode && err.statusCode >= 500;
  const isNetworkMsg = err.message && (
    err.message.toLowerCase().includes('network') ||
    err.message.toLowerCase().includes('timeout') ||
    err.message.toLowerCase().includes('connect')
  );
  return isConnection || isRateLimit || is5xx || isNetworkMsg;
};

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

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

        // Reset consecutive errors upon a successful fetch
        consecutiveErrors = 0;

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
          const updatedSub = await SubscriptionModel.findByIdAndUpdate(dbSub._id, updates, { new: true });
          logger.info(`Updated subscription ${dbSub._id} with Stripe data`);

          // Sync Tenant Workspace limits & status to prevent lockout/leakage
          if (updatedSub.tenantId) {
            await subscriptionService.syncTenantWithSubscription(
              updatedSub.tenantId,
              updatedSub
            );
            logger.info(`Self-healed Tenant ${updatedSub.tenantId} workspace limits and status`);
          }
          updated++;
        }

        synced++;
      } catch (error) {
        logger.error(`Error syncing subscription ${dbSub._id}:`, error.message);
        errors++;

        if (isStripeOutageError(error)) {
          consecutiveErrors++;
          logger.warn(`Stripe sync API outage detected. Consecutive failures: ${consecutiveErrors}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_THRESHOLD) {
            sendSecurityAlert(
              'Stripe Sync Outage Alert',
              `The background subscription sync cron job encountered multiple consecutive Stripe API outages or connection drops. Stripe services might be experiencing downtime.`,
              {
                consecutiveErrors,
                lastError: error.message,
                stripeErrorType: error.type || 'unknown',
                dbSubscriptionId: dbSub._id
              }
            ).catch(() => {});
            // Reset to prevent spamming alerts repeatedly in the same run
            consecutiveErrors = 0;
          }
        }

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
    sendSecurityAlert(
      'Stripe Sync Cron Failure',
      `The subscription synchronization cron job failed to execute completely.`,
      {
        errorMessage: error.message,
        stack: error.stack ? error.stack.substring(0, 500) : 'none'
      }
    ).catch(() => {});
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
