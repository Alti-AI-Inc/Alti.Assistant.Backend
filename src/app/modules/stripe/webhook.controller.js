import Stripe from 'stripe';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import subscriptionService from '../subscription/subscription.service.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import StripeEvent from '../subscription/stripeEvent.model.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

/**
 * Stripe Webhook Handler
 * Handles all Stripe webhook events for subscription management
 */
const handleStripeWebhook = catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret =
    config.stripe.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const isValidStripeIp = await isStripeIp(clientIp);

  if (!isValidStripeIp) {
    logger.error(`[STRIPE_SECURITY_ALERT] Webhook request originating from untrusted IP: ${clientIp}`);

    // Dispatch real-time security alert to Discord/Slack
    sendSecurityAlert(
      'Untrusted Webhook IP Blocked (Legacy Controller)',
      `An incoming Stripe webhook request was rejected because the sender IP did not originate from Stripe's official IP ranges.`,
      {
        senderIp: clientIp,
        userAgent: req.headers['user-agent'] || 'none',
        signaturePresent: !!sig
      }
    ).catch(() => {});

    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Forbidden: untrusted sender source IP'
    );
  }

  if (!webhookSecret) {
    logger.error('Stripe webhook secret not configured');
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Webhook secret not configured'
    );
  }

  let event;
  let verificationError = null;

  try {
    // Try primary secret first
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (primaryErr) {
      verificationError = primaryErr;

      const fallbackSecret = config.stripe.webhook_secret_fallback || process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
      if (fallbackSecret) {
        logger.info('[Stripe Security] Primary webhook secret verification failed. Trying fallback secret...');
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
    logger.info(`Webhook received: ${event.type}`);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);

    // Dispatch real-time security signature mismatch alert to Discord/Slack
    sendSecurityAlert(
      'Webhook Signature Mismatch (Legacy Controller)',
      `An incoming webhook signature check failed verification. This may indicate a replay attempt or incorrect webhook secret configuration.`,
      {
        senderIp: clientIp,
        errorMessage: err.message,
        userAgent: req.headers['user-agent'] || 'none',
        signature: sig || 'none'
      }
    ).catch(() => {});

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${err.message}`
    );
  }

  // Webhook Replay Protection Guard
  const existingEvent = await StripeEvent.findOne({ eventId: event.id });
  if (existingEvent) {
    logger.info(`Duplicate webhook event ${event.id} discarded in Legacy Webhook Controller.`);
    return res.json({ received: true, duplicate: true });
  }
  await StripeEvent.create({ eventId: event.id });

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // User completed checkout - create subscription
        const session = event.data.object;
        logger.info(`Checkout completed: ${session.id}`);

        await subscriptionService.processStripeCheckout(session.id);
        break;
      }

      case 'customer.subscription.created': {
        // Subscription created in Stripe
        const subscription = event.data.object;
        logger.info(`Subscription created: ${subscription.id}`);

        // This is handled by processStripeCheckout
        break;
      }

      case 'customer.subscription.updated': {
        // Subscription quantity or status changed
        const subscription = event.data.object;
        logger.info(`Subscription updated: ${subscription.id}`);

        await subscriptionService.updateSubscriptionFromStripe(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        // Subscription cancelled
        const subscription = event.data.object;
        logger.info(`Subscription deleted: ${subscription.id}`);

        await subscriptionService.updateSubscriptionFromStripe(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        // Payment successful - update subscription and tenant
        const invoice = event.data.object;
        logger.info(`Payment succeeded for invoice: ${invoice.id}`);

        await subscriptionService.handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        // Payment failed - mark subscription as past_due
        const invoice = event.data.object;
        logger.error(`Payment failed for invoice: ${invoice.id}`);

        await subscriptionService.handleInvoicePaymentFailed(invoice);
        break;
      }

      case 'invoice.payment_action_required': {
        // Payment requires additional action (e.g., 3D Secure)
        const invoice = event.data.object;
        logger.warn(`Payment action required for invoice: ${invoice.id}`);

        // Send email to user to complete payment
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Trial ending soon
        const subscription = event.data.object;
        logger.info(`Trial ending soon for subscription: ${subscription.id}`);

        // Send reminder email
        break;
      }

      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    logger.error('Error processing webhook:', error);
    // Still return 200 to prevent Stripe from retrying
    res.json({ received: true, error: error.message });
  }
});

/**
 * Test webhook endpoint (for development)
 * Simulates webhook events without Stripe CLI
 */
const testWebhook = catchAsync(async (req, res) => {
  const { eventType, data } = req.body;

  logger.info(`Test webhook: ${eventType}`);

  let result;

  switch (eventType) {
    case 'checkout.session.completed':
      result = await subscriptionService.processStripeCheckout(data.sessionId);
      break;

    case 'customer.subscription.updated':
      result = await subscriptionService.updateSubscriptionFromStripe(
        data.subscription
      );
      break;

    default:
      throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported test event type');
  }

  res.json({
    success: true,
    message: `Test webhook ${eventType} processed`,
    result,
  });
});

export default {
  handleStripeWebhook,
  testWebhook,
};
