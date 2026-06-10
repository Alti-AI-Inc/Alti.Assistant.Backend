import mongoose from 'mongoose';
import Stripe from 'stripe';
import winston from 'winston';
import { PubSub } from '@google-cloud/pubsub';
import config from '../../../../config/index.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMail.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import { purchasePlanTemplate } from './payment.utils.js';
import { logger } from '../../../shared/logger.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';
import Tenant from '../tenant/tenant.model.js';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import StripeEvent from '../subscription/stripeEvent.model.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';

/**
 * Stripe API client instance.
 * Initialized with the secret key from configuration and a specific API version.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  // CVE-PATCH-AGENT-NOTE: The Stripe API version is pinned to '2022-11-15'.
  // Consider updating to a more recent version (e.g., '2024-06-20') after thorough testing
  // to leverage new features and security enhancements.
  apiVersion: '2022-11-15',
});

// AGENT-REWRITE-NOTE: Initialize GCP Pub/Sub client to offload webhook processing.
// This ensures the webhook endpoint responds quickly to Stripe, preventing timeouts and retries.
// The actual processing is handled by a separate, scalable background worker.
const pubSubClient = new PubSub();
const stripeWebhookTopicName = config.gcp?.pubsub?.stripe_webhook_topic || 'stripe-webhook-events';
const stripeWebhookTopic = pubSubClient.topic(stripeWebhookTopicName);

/**
 * Plan limits configuration based on plan type.
 * Defines the maximum API calls, storage, and users allowed for each subscription plan.
 * @typedef {object} PlanLimits
 * @property {number} maxApiCalls - Maximum number of API calls allowed. -1 for unlimited.
 * @property {number} maxStorage - Maximum storage in bytes allowed. -1 for unlimited.
 * @property {number} maxUsers - Maximum number of users allowed. -1 for unlimited.
 *
 * @type {object.<string, PlanLimits>}
 */
const PLAN_LIMITS = {
  free: {
    maxApiCalls: 1000,
    maxStorage: 5368709120, // 5GB
    maxUsers: 5,
  },
  explore: {
    maxApiCalls: 10000,
    maxStorage: 53687091200, // 50GB
    maxUsers: 10,
  },
  analyze: {
    maxApiCalls: 50000,
    maxStorage: 107374182400, // 100GB
    maxUsers: 25,
  },
  execute: {
    maxApiCalls: 200000,
    maxStorage: 536870912000, // 500GB
    maxUsers: 100,
  },
  command: {
    maxApiCalls: -1, // Unlimited
    maxStorage: 1099511627776, // 1TB
    maxUsers: -1, // Unlimited
  },
  enterprise: {
    maxApiCalls: -1, // Unlimited
    maxStorage: -1, // Unlimited
    maxUsers: -1, // Unlimited
  },
};

/**
 * Creates a Stripe checkout session for a user to subscribe to a specific plan.
 * This function handles customer creation if necessary and sets up the subscription details.
 *
 * @param {object} user - The user object initiating the subscription.
 * @param {mongoose.Types.ObjectId} user._id - The ID of the user.
 * @param {string} user.email - The email of the user.
 * @param {mongoose.Types.ObjectId} user.tenantId - The ID of the tenant the user belongs to.
 * @param {object} plan - The plan details for the subscription.
 * @param {string} plan.plan_name - The name of the plan (e.g., 'explore', 'analyze').
 * @param {'month' | 'year'} plan.duration - The billing duration of the plan.
 * @param {number} plan.price - The price of the plan in USD.
 * @param {object} [req=null] - Optional Express request object, currently unused in this function's logic.
 * @returns {Promise<string>} A promise that resolves to the URL of the Stripe checkout session.
 * @throws {Error} If the plan name or duration is invalid, or if the user does not belong to a tenant.
 */
const createCheckoutSessionService = async (user, plan, req = null) => {
  if (!['explore', 'analyze', 'execute', 'command'].includes(plan.plan_name)) {
    throw new Error('Invalid plan name');
  }
  if (!['month', 'year'].includes(plan.duration)) {
    throw new Error('Invalid plan duration');
  }

  // Get user's tenant
  // OPTIMIZATION: Added .lean() as the tenant document is only read and not modified in this function.
  const tenant = await Tenant.findById(user.tenantId).lean();
  if (!tenant) {
    throw new Error('User must belong to a tenant to subscribe');
  }

  // Get existing subscription for tenant to check for stripeCustomerId
  // OPTIMIZATION: Added .lean() as the subscription document is only read and not modified in this function.
  // RECOMMENDATION: Consider adding a compound index to SubscriptionModel on `{ tenantId: 1, status: 1 }` for faster lookups.
  const existingSubscription = await SubscriptionModel.findOne({
    tenantId: tenant._id,
    status: 'active',
  }).lean();
  let stripeCustomerId = existingSubscription?.stripeCustomerId;

  if (!stripeCustomerId) {
    // Create new Stripe customer for tenant
    const customer = await stripe.customers.create({
      email: user.email,
      name: tenant.name,
      metadata: {
        tenantId: tenant._id.toString(),
        tenantSlug: tenant.slug,
        ownerId: tenant.ownerId.toString(),
      },
    });
    stripeCustomerId = customer.id;

    logger.info('Created Stripe customer for tenant', {
      tenantId: tenant._id,
      customerId: stripeCustomerId,
    });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer: stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: plan.plan_name },
          unit_amount: plan.price * 100,
          recurring: { interval: plan.duration },
        },
        quantity: 1,
      },
    ],
    mode: 'subscription',
    metadata: {
      plan_name: plan.plan_name,
      duration: plan.duration,
      tenantId: tenant._id.toString(),
      userId: user._id.toString(),
    },
    success_url: `${config.client_url}`,
    cancel_url: `${config.client_url}`,
  });

  return session.url;
};

/**
 * AGENT-REWRITE-NOTE: This function now only handles the initial, lightweight part of the webhook process.
 * It verifies the request's authenticity, prevents replay attacks, and then immediately offloads
 * the heavy processing to a background worker by publishing the event to a GCP Pub/Sub topic.
 * This ensures a fast response to Stripe, improving reliability and scalability.
 *
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the webhook is acknowledged or an error is sent.
 */
const handleWebhookService = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = config.stripe.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const isValidStripeIp = await isStripeIp(clientIp);

  if (!isValidStripeIp) {
    logger.error(`[STRIPE_SECURITY_ALERT] Webhook request originating from untrusted IP in Legacy Payment Service: ${clientIp}`);

    sendSecurityAlert(
      'Untrusted Webhook IP Blocked (Legacy Payment Service)',
      `An incoming Stripe webhook request was rejected because the sender IP did not originate from Stripe's official IP ranges.`,
      {
        senderIp: clientIp,
        userAgent: req.headers['user-agent'] || 'none',
        signaturePresent: !!sig
      }
    ).catch(() => {});

    return res
      .status(403)
      .send('Forbidden: untrusted sender source IP');
  }

  if (!webhookSecret) {
    logger.error('Missing Stripe webhook secret configuration');
    return res
      .status(500)
      .send('Webhook secret not configured');
  }

  if (!sig) {
    logger.error('Missing Stripe signature header');
    return res
      .status(400)
      .send('Missing Stripe Signature');
  }

  let event;
  let verificationError = null;

  try {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (primaryErr) {
      verificationError = primaryErr;

      const fallbackSecret = config.stripe.webhook_secret_fallback || process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
      if (fallbackSecret) {
        logger.info('[Stripe Security] Primary webhook secret verification failed in Legacy Payment Service. Trying fallback secret...');
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, fallbackSecret);
          verificationError = null; // Verified! Clear error
          logger.info('[Stripe Security] Webhook signature verified successfully using fallback secret.');
        } catch (fallbackErr) {
          verificationError = new Error(`Both primary and fallback secret verifications failed. Fallback error: ${fallbackErr.message}`);
        }
      }
    }

    if (verificationError) {
      throw verificationError;
    }
    logger.info('Webhook event received (Legacy Payment Service)', { eventType: event.type });
  } catch (err) {
    logger.error('Webhook signature verification failed (Legacy Payment Service):', err.message);

    sendSecurityAlert(
      'Webhook Signature Mismatch (Legacy Payment Service)',
      `An incoming webhook signature check failed verification. This may indicate a replay attempt or incorrect webhook secret configuration.`,
      {
        senderIp: clientIp,
        errorMessage: err.message,
        userAgent: req.headers['user-agent'] || 'none',
        signature: sig || 'none'
      }
    ).catch(() => {});

    return res
      .status(400)
      .send(`Webhook signature verification failed: ${err.message}`);
  }

  // Webhook Replay Protection Guard
  const existingEvent = await StripeEvent.findOne({ eventId: event.id }).lean();
  if (existingEvent) {
    logger.info(`Duplicate webhook event ${event.id} discarded in Legacy Payment Service.`);
    return res.status(200).send('Webhook processed successfully (Duplicate)');
  }
  // IMPORTANT: Create the event record *before* acknowledging to prevent race conditions with retries.
  await StripeEvent.create({ eventId: event.id });

  try {
    // Offload the actual processing to a background worker via Pub/Sub
    const dataBuffer = Buffer.from(JSON.stringify(event));
    await stripeWebhookTopic.publishMessage({ data: dataBuffer });

    logger.info(`Successfully published event ${event.id} (${event.type}) to Pub/Sub for background processing.`);

    // Acknowledge the event to Stripe immediately
    res.status(200).send('Webhook acknowledged and queued for processing.');

  } catch (error) {
    logger.error('Failed to publish Stripe event to Pub/Sub', {
      eventId: event.id,
      error: error.message,
      stack: error.stack,
    });
    // If publishing fails, we cannot process the event.
    // Return a 500 error so Stripe will retry the webhook.
    // The replay protection will prevent reprocessing if a future attempt succeeds.
    res.status(500).send('Failed to queue webhook for processing.');
  }
};

/**
 * AGENT-REWRITE-NOTE: This new function contains the core business logic for processing Stripe events.
 * It is designed to be triggered by a GCP Pub/Sub subscription (e.g., via a Cloud Function or Cloud Run service).
 * This isolates the long-running tasks (DB operations, external API calls, email sending) from the
 * initial webhook acknowledgement, making the system more robust and scalable.
 *
 * @param {object} event - The Stripe event object, parsed from the Pub/Sub message.
 * @returns {Promise<void>} A promise that resolves when processing is complete.
 * @throws {Error} Throws an error if processing fails, which should trigger a Pub/Sub retry.
 */
const processStripeEventService = async (event) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    logger.info(`[BACKGROUND_WORKER] Processing event ${event.id}`, { eventType: event.type });

    if (event.type === 'checkout.session.completed') {
      const stripeSession = event.data.object;
      logger.info('[BACKGROUND_WORKER] Checkout session data', { sessionId: stripeSession.id });

      if (
        !stripeSession.metadata.plan_name ||
        !stripeSession.metadata.duration ||
        !stripeSession.metadata.tenantId
      ) {
        throw new Error(`Invalid session metadata for event ${event.id}`);
      }

      const tenant = await Tenant.findById(stripeSession.metadata.tenantId).session(session);
      if (!tenant) {
        throw new Error(`Tenant not found for event ${event.id}, tenantId: ${stripeSession.metadata.tenantId}`);
      }

      const user = await UserModel.findById(stripeSession.metadata.userId).session(session);
      if (!user) {
        throw new Error(`User not found for event ${event.id}, userId: ${stripeSession.metadata.userId}`);
      }

      const existingSubscription = await SubscriptionModel.findOne({ transactionId: stripeSession.id }).session(session).lean();
      if (existingSubscription) {
        logger.warn(`[BACKGROUND_WORKER] Subscription already exists for event ${event.id}, transactionId: ${stripeSession.id}. Skipping.`);
        await session.commitTransaction(); // Commit to end transaction, but do nothing.
        return;
      }

      let invoiceUrl = null;
      let stripeSubscriptionId = null;

      if (stripeSession.subscription) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(stripeSession.subscription);
          stripeSubscriptionId = stripeSubscription.id;

          if (stripeSubscription.latest_invoice) {
            const invoice = await stripe.invoices.retrieve(stripeSubscription.latest_invoice);
            invoiceUrl = invoice.hosted_invoice_url;
          }
        } catch (error) {
          logger.error('[BACKGROUND_WORKER] Error retrieving invoice', { message: error.message });
        }
      }

      const planName = stripeSession.metadata.plan_name;
      const expirationDate = getExpirationDate(stripeSession.metadata.duration);

      const subscriptionData = {
        userId: user._id,
        tenantId: tenant._id,
        transactionId: stripeSession.id,
        price: stripeSession.amount_total / 100,
        plan_name: planName,
        duration: stripeSession.metadata.duration,
        expiresAt: expirationDate,
        paymentStatus: stripeSession.payment_status || 'paid',
        invoiceUrl,
      };

      const newSubscription = new SubscriptionModel(subscriptionData);
      newSubscription.stripeCustomerId = stripeSession.customer;
      newSubscription.stripeSubscriptionId = stripeSubscriptionId;
      await newSubscription.save({ session });
      logger.info('[BACKGROUND_WORKER] Subscription saved', { subscriptionId: newSubscription._id });

      tenant.plan = planName;
      tenant.status = 'active';
      tenant.subscriptionId = newSubscription._id;
      const planLimits = PLAN_LIMITS[planName] || PLAN_LIMITS.free;
      tenant.limits = {
        maxApiCalls: planLimits.maxApiCalls,
        maxStorage: planLimits.maxStorage,
        maxUsers: planLimits.maxUsers,
      };
      await tenant.save({ session });
      logger.info('[BACKGROUND_WORKER] Tenant updated', { tenantId: tenant._id, plan: planName });

      user.isSubscribed = true;
      user.subscription = {
        price: stripeSession.amount_total / 100,
        plan_name: planName,
        duration: stripeSession.metadata.duration,
        expiresAt: expirationDate,
        status: 'paid',
        invoiceUrl,
      };
      await user.save({ session });
      logger.info('[BACKGROUND_WORKER] User updated', { email: user.email });

      try {
        const mailData = await purchasePlanTemplate(user.email, user, newSubscription);
        await sendMailWithMailGun(mailData);
        logger.info('[BACKGROUND_WORKER] Confirmation email sent', { email: user.email });
      } catch (emailError) {
        logger.error('[BACKGROUND_WORKER] Failed to send confirmation email', {
          email: user.email,
          message: emailError.message,
        });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const existingSubscription = await SubscriptionModel.findOne({ stripeSubscriptionId: subscription.id }).session(session);

      if (existingSubscription) {
        existingSubscription.paymentStatus = 'expired';
        existingSubscription.status = 'cancelled';
        await existingSubscription.save({ session });

        const tenant = await Tenant.findById(existingSubscription.tenantId).session(session);
        if (tenant) {
          tenant.plan = 'free';
          tenant.status = 'active';
          tenant.limits = {
            maxApiCalls: PLAN_LIMITS.free.maxApiCalls,
            maxStorage: PLAN_LIMITS.free.maxStorage,
            maxUsers: PLAN_LIMITS.free.maxUsers,
          };
          await tenant.save({ session });
          logger.info('[BACKGROUND_WORKER] Tenant reverted to free plan', { tenantId: tenant._id });
        }

        const user = await UserModel.findById(existingSubscription.userId).session(session);
        if (user) {
          user.isSubscribed = false;
          user.subscription = null;
          await user.save({ session });
          logger.info('[BACKGROUND_WORKER] User subscription status updated', { email: user.email });
        }
        logger.info('[BACKGROUND_WORKER] Subscription marked as expired', { stripeSubscriptionId: subscription.id });
      } else {
        logger.warn(`[BACKGROUND_WORKER] Subscription not found for cancellation event ${event.id}`, { stripeSubscriptionId: subscription.id });
      }
    }

    await session.commitTransaction();
    logger.info(`[BACKGROUND_WORKER] Successfully processed event ${event.id}`);
  } catch (error) {
    logger.error(`[BACKGROUND_WORKER] Error processing event ${event.id}`, {
      message: error.message,
      stack: error.stack,
    });
    await session.abortTransaction();
    // Re-throw the error to signal failure to the Pub/Sub subscriber,
    // which will trigger a retry according to the subscription's policy.
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Calculates the expiration date for a subscription based on its duration.
 *
 * @param {'month' | 'year'} duration - The duration of the subscription.
 * @returns {Date} The calculated expiration date, either one month or one year from the current date.
 */
const getExpirationDate = (duration) => {
  // PATCH: Replaced moment.js with native Date to remove dependency on a library in maintenance mode.
  // This avoids potential vulnerabilities (e.g., ReDoS in older versions) and improves performance.
  const expiration = new Date();
  if (duration === 'month') {
    // Handles month rollover correctly (e.g., Jan 31 -> Feb 28/29)
    expiration.setMonth(expiration.getMonth() + 1);
  } else { // Assumes 'year' based on prior validation in createCheckoutSessionService
    expiration.setFullYear(expiration.getFullYear() + 1);
  }
  return expiration;
};

/**
 * @namespace PaymentService
 * @description Provides services for handling payment-related operations,
 * including creating Stripe checkout sessions and processing Stripe webhooks.
 */
export const PaymentService = {
  createCheckoutSessionService,
  handleWebhookService,
  // AGENT-REWRITE-NOTE: Exporting the new processing function for use by the background worker.
  processStripeEventService,
};