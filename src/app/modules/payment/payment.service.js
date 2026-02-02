import moment from 'moment';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import winston from 'winston';
import config from '../../../../config/index.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMailWithMailGun.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import { purchasePlanTemplate } from './payment.utils.js';
import { logger } from '../../../shared/logger.js';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';
import Tenant from '../tenant/tenant.model.js';

const stripe = new Stripe(config.stripe.stripe_secret_key);

/**
 * Plan limits configuration based on plan type
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

const createCheckoutSessionService = async (user, plan, req = null) => {
  if (!['explore', 'analyze', 'execute', 'command'].includes(plan.plan_name)) {
    throw new Error('Invalid plan name');
  }
  if (!['month', 'year'].includes(plan.duration)) {
    throw new Error('Invalid plan duration');
  }

  // Get user's tenant
  const tenant = await Tenant.findById(user.tenantId);
  if (!tenant) {
    throw new Error('User must belong to a tenant to subscribe');
  }

  // Get existing subscription for tenant to check for stripeCustomerId
  const existingSubscription = await SubscriptionModel.findOne({ tenantId: tenant._id, status: 'active' });
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

const handleWebhookService = async (req, res) => {
  const endpointSecret = config.stripe.stripe_webhook_secret_key;
  const sig = req.headers['stripe-signature'];

  if (!sig || !endpointSecret) {
    logger.error('Missing Stripe signature or webhook secret');
    return res
      .status(400)
      .send('Webhook Error: Missing Stripe Signature or Secret');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    logger.info('Webhook event received', { eventType: event.type });
  } catch (err) {
    logger.error('Webhook signature verification failed', {
      message: err.message,
    });
    return res
      .status(400)
      .send(`Webhook signature verification failed: ${err.message}`);
  }

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
      const tenant = await Tenant.findById(stripeSession.metadata.tenantId).session(session);
      if (!tenant) {
        logger.warn('No tenant found', { tenantId: stripeSession.metadata.tenantId });
        throw new Error('Tenant not found');
      }

      // Find user
      const user = await UserModel.findById(stripeSession.metadata.userId).session(session);
      if (!user) {
        logger.warn('No user found', { userId: stripeSession.metadata.userId });
        throw new Error('User not found');
      }

      // Check for existing subscription to prevent duplicates
      const existingSubQuery = { transactionId: stripeSession.id };
      const existingSubscription = await SubscriptionModel.findOne(
        req ? withTenantFilter(req, existingSubQuery) : existingSubQuery
      ).session(session);
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
            stripeSession.subscription,
          );
          stripeSubscriptionId = stripeSubscription.id;

          if (stripeSubscription.latest_invoice) {
            const invoice = await stripe.invoices.retrieve(
              stripeSubscription.latest_invoice,
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
          newSubscription,
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

      const existingSubQuery = { transactionId: subscription.id };
      const existingSubscription = await SubscriptionModel.findOne(
        req ? withTenantFilter(req, existingSubQuery) : existingSubQuery
      ).session(session);

      if (existingSubscription) {
        existingSubscription.paymentStatus = 'expired';
        existingSubscription.status = 'cancelled';
        await existingSubscription.save({ session });

        // Update tenant status and revert to free plan
        const tenant = await Tenant.findById(existingSubscription.tenantId).session(session);
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
        const user = await UserModel.findById(existingSubscription.userId).session(session);
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
          transactionId: subscription.id,
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

const getExpirationDate = duration => {
  return duration === 'month'
    ? moment().add(1, 'months').toDate()
    : moment().add(1, 'years').toDate();
};

export const PaymentService = {
  createCheckoutSessionService,
  handleWebhookService,
};
