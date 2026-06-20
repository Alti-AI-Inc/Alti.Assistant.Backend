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
import emailService from '../../../shared/email.service.js';

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * Initializes the Stripe API client with the secret key and API version.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2024-06-20', // CVE-PATCH-AGENT: Updated Stripe API version to the latest stable release for security, compliance, and feature enhancements.
});

/**
 * @swagger
 * tags:
 *   name: Stripe Webhooks
 *   description: Endpoints for handling Stripe webhook events.
 *
 * /api/v1/stripe/webhook:
 *   post:
 *     summary: Handles all incoming Stripe webhook events.
 *     description: |
 *       This endpoint receives and processes various Stripe webhook events, such as `checkout.session.completed`,
 *       `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, etc.
 *       It performs critical security checks including IP verification and signature verification to ensure
 *       the authenticity and integrity of the webhook payload. It also implements replay protection.
 *
 *       **Important Security Notes:**
 *       1.  **IP Verification:** Only requests originating from official Stripe IP ranges are processed.
 *           Requests from untrusted IPs are logged, trigger security alerts, and are rejected with a 403 Forbidden.
 *       2.  **Signature Verification:** The `Stripe-Signature` header is used to verify the authenticity
 *           of the webhook payload. If verification fails, the request is rejected with a 400 Bad Request
 *           and a security alert is dispatched. Fallback secrets are supported.
 *       3.  **Raw Body Requirement:** This endpoint *must* be configured with `express.raw({ type: 'application/json' })`
 *           middleware to ensure `req.body` is the raw buffer, which is essential for signature verification.
 *           If `req.body` is already parsed (e.g., by `express.json()`), verification will fail.
 *       4.  **Replay Protection:** Each unique Stripe event ID is stored to prevent processing the same
 *           event multiple times, guarding against replay attacks or duplicate deliveries.
 *
 *       Upon successful verification and processing, the relevant subscription or payment services are invoked.
 *     tags:
 *       - Stripe Webhooks
 *     requestBody:
 *       description: The raw JSON payload from Stripe.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The raw Stripe event object.
 *             example:
 *               id: "evt_12345"
 *               object: "event"
 *               type: "checkout.session.completed"
 *               data:
 *                 object:
 *                   id: "cs_test_12345"
 *                   object: "checkout.session"
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         schema:
 *           type: string
 *         required: true
 *         description: The Stripe-Signature header containing the timestamp and signature(s).
 *     responses:
 *       200:
 *         description: Webhook event received and processed successfully (or acknowledged for retry prevention).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   description: Indicates if the webhook was received.
 *                   example: true
 *                 duplicate:
 *                   type: boolean
 *                   description: (Optional) Indicates if the event was a duplicate and discarded.
 *                   example: true
 *                 error:
 *                   type: string
 *                   description: (Optional) Error message if processing failed but 200 is returned to prevent retries.
 *                   example: "Error processing event"
 *       400:
 *         description: Bad Request - Signature verification failed or payload format error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Forbidden - Request originated from an untrusted IP address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         description: Internal Server Error - Webhook secret not configured or other server-side issues.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
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

  // CRITICAL SECURITY/FUNCTIONAL FIX: Ensure req.body is the raw buffer for Stripe signature verification.
  // If Express's `express.json()` middleware is applied globally before this route, `req.body` will be parsed
  // into an object, causing signature verification to fail.
  // The webhook route MUST use `express.raw({ type: 'application/json' })` middleware to provide the raw body.
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') {
    logger.error(
      `[STRIPE_WEBHOOK_ERROR] Webhook payload is not raw buffer/string. Type: ${typeof rawBody}. ` +
      `Ensure 'express.raw({ type: "application/json" })' middleware is used for this route, ` +
      `and placed BEFORE any 'express.json()' middleware.`
    );
    sendSecurityAlert(
      'Stripe Webhook Misconfiguration (Legacy Controller)',
      `Stripe webhook received a parsed payload (object) instead of the raw body. ` +
      `Signature verification will fail. Check Express middleware configuration.`,
      {
        senderIp: clientIp,
        payloadType: typeof rawBody,
        userAgent: req.headers['user-agent'] || 'none',
        signaturePresent: !!sig
      }
    ).catch(() => {});
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Webhook payload format error: raw body required for signature verification.'
    );
  }

  let event;
  let verificationError = null;

  try {
    // Try primary secret first
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (primaryErr) {
      verificationError = primaryErr;

      const fallbackSecret = config.stripe.webhook_secret_fallback || process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
      if (fallbackSecret) {
        logger.info('[Stripe Security] Primary webhook secret verification failed. Trying fallback secret...');
        try {
          event = stripe.webhooks.constructEvent(rawBody, sig, fallbackSecret);
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
  // Optimization: Add .lean() for faster query as the document is not modified.
  // IMPORTANT: Ensure 'eventId' in the StripeEvent model has a unique index for efficient lookups and robust replay protection.
  // Without a unique index, a race condition could lead to duplicate event processing.
  const existingEvent = await StripeEvent.findOne({ eventId: event.id }).lean();
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

        // This is typically handled by processStripeCheckout to avoid double processing.
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

        const email = invoice.customer_email || (invoice.customer ? (await stripe.customers.retrieve(invoice.customer)).email : null);
        if (email) {
          const amountDueStr = `$${(invoice.amount_due / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`;
          await emailService.sendPaymentActionRequiredEmail({
            to: email,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
            amountDue: amountDueStr
          });
        } else {
          logger.error(`Could not determine customer email for payment action required webhook. Invoice: ${invoice.id}`);
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Trial ending soon
        const subscription = event.data.object;
        logger.info(`Trial ending soon for subscription: ${subscription.id}`);

        const customer = await stripe.customers.retrieve(subscription.customer);
        const email = customer.email;
        if (email) {
          await emailService.sendTrialEndingEmail({
            to: email,
            trialEnd: subscription.trial_end
          });
        } else {
          logger.error(`Could not determine customer email for trial will end webhook. Subscription: ${subscription.id}`);
        }
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
 * @swagger
 * /api/v1/stripe/test-webhook:
 *   post:
 *     summary: Simulates Stripe webhook events for development and testing.
 *     description: |
 *       This endpoint allows developers to manually trigger specific Stripe webhook event processing
 *       without needing to use the Stripe CLI or actual Stripe transactions.
 *       It is **disabled in production environments** for security reasons.
 *
 *       **Available `eventType` values:**
 *       - `checkout.session.completed`: Simulates a completed checkout session. Requires `data.sessionId`.
 *       - `customer.subscription.updated`: Simulates a subscription update. Requires `data.subscription` object.
 *
 *       This is useful for local development and integration testing of webhook handlers.
 *     tags:
 *       - Stripe Webhooks
 *       - Development
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventType
 *               - data
 *             properties:
 *               eventType:
 *                 type: string
 *                 description: The type of Stripe event to simulate.
 *                 enum:
 *                   - checkout.session.completed
 *                   - customer.subscription.updated
 *                 example: "checkout.session.completed"
 *               data:
 *                 type: object
 *                 description: The data payload for the simulated event.
 *                 oneOf:
 *                   - properties:
 *                       sessionId:
 *                         type: string
 *                         description: The ID of the checkout session to process.
 *                         example: "cs_test_12345"
 *                     required:
 *                       - sessionId
 *                   - properties:
 *                       subscription:
 *                         type: object
 *                         description: The Stripe subscription object to update.
 *                         example:
 *                           id: "sub_12345"
 *                           status: "active"
 *                           items:
 *                             data:
 *                               - id: "si_12345"
 *                                 price:
 *                                   id: "price_12345"
 *                     required:
 *                       - subscription
 *     responses:
 *       200:
 *         description: Test webhook event processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Test webhook checkout.session.completed processed"
 *                 result:
 *                   type: object
 *                   description: The result of the service operation.
 *       400:
 *         description: Bad Request - Unsupported test event type or missing data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       403:
 *         description: Forbidden - Test webhook is disabled in production.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
const testWebhook = catchAsync(async (req, res) => {
  if (config.env === 'production') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Test webhook is disabled in production environment');
  }
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

/**
 * Exports the Stripe webhook controller functions.
 * @namespace StripeWebhookController
 */
export default {
  handleStripeWebhook,
  testWebhook,
};