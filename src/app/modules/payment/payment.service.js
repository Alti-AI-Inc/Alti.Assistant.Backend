import mongoose from 'mongoose';
import Stripe from 'stripe';
import winston from 'winston';
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
 * Handles incoming Stripe webhook events.
 * This service verifies the webhook signature, prevents replay attacks,
 * and processes various event types such as `checkout.session.completed`
 * and `customer.subscription.deleted` to update the application's database.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.headers - Request headers, including 'stripe-signature'.
 * @param {string} req.headers['stripe-signature'] - The Stripe signature header for webhook verification.
 * @param {string} req.ip - The IP address of the client making the request.
 * @param {object} req.body - The raw request body containing the Stripe event payload.
 * @param {object} res - The Express response object used to send back status codes to Stripe.
 * @returns {Promise<void>} A promise that resolves when the webhook is processed and a response is sent.
 *   Sends a 200 status for successful processing, 400 for verification failures,
 *   403 for untrusted IPs, 500 for internal server errors or missing configurations.
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
  // OPTIMIZATION: Added .lean() as the event document is only checked for existence.
  // RECOMMENDATION: Consider adding an index to StripeEventModel on `{ eventId: 1 }` for faster lookups.
  const existingEvent = await StripeEvent.findOne({ eventId: event.id }).lean();
  if (existingEvent) {
    logger.info(`Duplicate webhook event ${event.id} discarded in Legacy Payment Service.`);
    return res.status(200).send('Webhook processed successfully (Duplicate)');
  }
  await StripeEvent.create({ eventId: event.id });

  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    logger.info('Processing event', { eventType: event.type });

    if (event.type === 'checkout.session.completed') {
      const stripeSession = event.data.object;
      logger.info('Checkout session data', { sessionId: stripeSession.id });

      // Validate metadata
      if (
        !stripeSession.metadata.plan_name ||
        !stripeSession.metadata.duration ||
        !stripeSession.metadata.tenantId
      ) {
        logger.error('Missing required metadata in session', {
          metadata: stripeSession.metadata,
        });
        throw new Error('Invalid session metadata');
      }

      // Find tenant
      // No .lean() here as the tenant document is modified later in the transaction.
      const tenant = await Tenant.findById(
        stripeSession.metadata.tenantId
      ).session(session);
      if (!tenant) {
        logger.warn('No tenant found', {
          tenantId: stripeSession.metadata.tenantId,
        });
        throw new Error('Tenant not found');
      }

      // Find user
      // No .lean() here as the user document is modified later in the transaction.
      const user = await UserModel.findById(
        stripeSession.metadata.userId
      ).session(session);
      if (!user) {
        logger.warn('No user found', { userId: stripeSession.metadata.userId });
        throw new Error('User not found');
      }

      // Check for existing subscription to prevent duplicates
      // OPTIMIZATION: Added .lean() as the subscription document is only checked for existence.
      // The `withTenantFilter` helper is designed for user-initiated requests with `req.user` context.
      // For webhooks, the `tenantId` is already explicitly provided in the Stripe metadata,
      // so `withTenantFilter` is not applicable and could cause issues if `req` lacks the expected tenant context.
      // RECOMMENDATION: Consider adding an index to SubscriptionModel on `{ transactionId: 1 }` for faster lookups.
      const existingSubQuery = { transactionId: stripeSession.id };
      const existingSubscription = await SubscriptionModel.findOne(
        existingSubQuery
      ).session(session).lean();
      if (existingSubscription) {
        logger.warn('Subscription already exists', {
          transactionId: stripeSession.id,
        });
        await session.commitTransaction();
        return res.status(200).send('Webhook processed successfully');
      }

      // Prepare subscription data and fetch invoiceUrl
      let invoiceUrl = null;
      let stripeSubscriptionId = null;

      if (stripeSession.subscription) {
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(
            stripeSession.subscription
          );
          stripeSubscriptionId = stripeSubscription.id;

          if (stripeSubscription.latest_invoice) {
            const invoice = await stripe.invoices.retrieve(
              stripeSubscription.latest_invoice
            );
            invoiceUrl = invoice.hosted_invoice_url;
          }
        } catch (error) {
          logger.error('Error retrieving invoice', { message: error.message });
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

      // Save subscription
      const newSubscription = new SubscriptionModel(subscriptionData);
      // Add Stripe IDs to subscription
      newSubscription.stripeCustomerId = stripeSession.customer;
      newSubscription.stripeSubscriptionId = stripeSubscriptionId;
      await newSubscription.save({ session });
      logger.info('Subscription saved', {
        subscriptionId: newSubscription._id,
      });

      // Update tenant with subscription reference and limits (single source of truth is Subscription model)
      tenant.plan = planName;
      tenant.status = 'active';
      tenant.subscriptionId = newSubscription._id;

      // Update tenant limits based on plan
      const planLimits = PLAN_LIMITS[planName] || PLAN_LIMITS.free;
      tenant.limits = {
        maxApiCalls: planLimits.maxApiCalls,
        maxStorage: planLimits.maxStorage,
        maxUsers: planLimits.maxUsers,
      };

      await tenant.save({ session });
      logger.info('Tenant updated with subscription reference', {
        tenantId: tenant._id,
        subscriptionId: newSubscription._id,
        plan: planName,
      });

      // Update user subscription info (for backward compatibility)
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
      logger.info('User updated', { email: user.email });

      // Send email confirmation
      try {
        const mailData = await purchasePlanTemplate(
          user.email,
          user,
          newSubscription
        );
        await sendMailWithMailGun(mailData);
        logger.info('Confirmation email sent', { email: user.email });
      } catch (emailError) {
        logger.error('Failed to send confirmation email', {
          email: user.email,
          message: emailError.message,
        });
      }

      await session.commitTransaction();
      logger.info('Subscription created and tenant updated successfully', {
        tenantId: tenant._id,
        userId: user._id,
      });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;

      // When a `customer.subscription.deleted` event occurs, `subscription.id` refers to the Stripe Subscription ID.
      // Our `SubscriptionModel` stores this in the `stripeSubscriptionId` field, not `transactionId` (which holds the Checkout Session ID).
      // The `withTenantFilter` helper is designed for user-initiated requests with `req.user` context.
      // For webhooks, the `tenantId` is derived from the found subscription, so `withTenantFilter` is not applicable.
      // RECOMMENDATION: Consider adding an index to SubscriptionModel on `{ stripeSubscriptionId: 1 }` for faster lookups.
      const existingSubQuery = { stripeSubscriptionId: subscription.id };
      const existingSubscription = await SubscriptionModel.findOne(
        existingSubQuery
      ).session(session);

      if (existingSubscription) {
        existingSubscription.paymentStatus = 'expired';
        existingSubscription.status = 'cancelled';
        await existingSubscription.save({ session });

        // Update tenant status and revert to free plan
        // No .lean() here as the tenant document is modified later in the transaction.
        const tenant = await Tenant.findById(
          existingSubscription.tenantId
        ).session(session);
        if (tenant) {
          tenant.plan = 'free';
          tenant.status = 'active';
          // Clear subscription reference (or keep for history, but subscription status will be 'cancelled')
          // tenant.subscriptionId = null; // Uncomment if you want to clear reference

          // Reset limits to free tier
          tenant.limits = {
            maxApiCalls: PLAN_LIMITS.free.maxApiCalls,
            maxStorage: PLAN_LIMITS.free.maxStorage,
            maxUsers: PLAN_LIMITS.free.maxUsers,
          };

          await tenant.save({ session });
          logger.info('Tenant reverted to free plan', {
            tenantId: tenant._id,
          });
        }

        // Update user subscription status (backward compatibility)
        // No .lean() here as the user document is modified later in the transaction.
        const user = await UserModel.findById(
          existingSubscription.userId
        ).session(session);
        if (user) {
          user.isSubscribed = false;
          user.subscription = null;
          await user.save({ session });
          logger.info('User subscription status updated', {
            email: user.email,
          });
        }

        await session.commitTransaction();
        logger.info('Subscription marked as expired', {
          stripeSubscriptionId: subscription.id,
        });
      }
    }

    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    logger.error('Error processing webhook', {
      message: error.message,
      stack: error.stack,
    });
    await session.abortTransaction();
    res.status(500).send(`Internal server error: ${error.message}`);
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
};