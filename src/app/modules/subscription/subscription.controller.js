import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import subscriptionService from './subscription.service.js';
import ProductModel from '../products/products.model.js';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js';
import StripeEvent from './stripeEvent.model.js';
import BillingAuditLog from './billingAuditLog.model.js';
import { logger } from '../../../shared/logger.js';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';

/**
 * Subscription Controller
 * HTTP handlers for subscription management
 */

/**
 * Get all available plans
 * GET /api/v1/subscription/plans
 */
const getAvailablePlans = catchAsync(async (req, res) => {
  const plans = await ProductModel.getAvailablePlans();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Plans retrieved successfully',
    data: plans.map((plan) => plan.toPublicJSON()),
  });
});

/**
 * Get current user's subscription
 * GET /api/v1/subscription/my-subscription
 */
const getMySubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const subscriptionData =
    await subscriptionService.getSubscriptionWithUsage(userId);

  if (!subscriptionData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No subscription found');
  }

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Subscription retrieved successfully',
    data: subscriptionData,
  });
});

/**
 * Get tenant subscription
 * GET /api/v1/subscription/tenant/:tenantId
 */
const getTenantSubscription = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const subscription =
    await subscriptionService.getTenantSubscription(tenantId);

  if (!subscription) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No subscription found for this tenant'
    );
  }

  const subscriptionData = await subscriptionService.getSubscriptionWithUsage(
    subscription.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Tenant subscription retrieved successfully',
    data: subscriptionData,
  });
});

/**
 * Create free subscription
 * POST /api/v1/subscription/create-free
 */
const createFreeSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { tenantId } = req.body;

  const subscription = await subscriptionService.createFreeSubscription(
    userId,
    tenantId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Free subscription created successfully',
    data: subscription,
  });
});

/**
 * Upgrade subscription (hybrid approach)
 * POST /api/v1/subscription/upgrade
 *
 * Response types:
 * - type: 'plan_changed' - Plan was updated (existing subscription)
 * - type: 'subscription_created' - New subscription created with saved payment method
 * - type: 'requires_action' - 3D Secure required, frontend must confirm
 * - type: 'checkout_session' - No saved payment method, redirect to Stripe checkout
 */
const upgradeSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { stripeProductId, planName, tenantId, seats } = req.body;

  // Require either stripeProductId or planName
  if (!stripeProductId && !planName) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Either stripeProductId or planName is required'
    );
  }

  const initialSeats = seats || 1;
  if (initialSeats < 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Seats must be at least 1');
  }

  const result = await subscriptionService.upgradeSubscription(
    userId,
    { stripeProductId, planName },
    tenantId,
    initialSeats,
    { userId, ipAddress: req.ip }
  );

  // Determine response message based on result type
  let message;
  let statusCode = httpStatus.OK;

  switch (result.type) {
    case 'plan_changed':
      message = result.message || 'Plan changed successfully';
      break;
    case 'subscription_created':
      message = result.message || 'Subscription created successfully';
      statusCode = httpStatus.CREATED;
      break;
    case 'requires_action':
      message = result.message || 'Payment requires additional authentication';
      statusCode = httpStatus.ACCEPTED;
      break;
    case 'checkout_session':
      message =
        result.message ||
        'Checkout session created - redirect to complete payment';
      break;
    default:
      message = 'Subscription updated';
  }

  sendResponse(res, {
    success: true,
    statusCode,
    message,
    data: result,
  });
});

/**
 * Confirm subscription payment after 3D Secure
 * POST /api/v1/subscription/confirm-payment
 */
const confirmPayment = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { subscriptionId, tenantId } = req.body;

  if (!subscriptionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Subscription ID is required');
  }

  const subscription = await subscriptionService.confirmSubscriptionPayment(
    subscriptionId,
    userId,
    tenantId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Subscription activated successfully',
    data: subscription,
  });
});

/**
 * Process successful checkout
 * POST /api/v1/subscription/process-checkout
 */
const processCheckout = catchAsync(async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Session ID is required');
  }

  const subscription =
    await subscriptionService.processStripeCheckout(sessionId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Subscription activated successfully',
    data: subscription,
  });
});

/**
 * Cancel subscription
 * POST /api/v1/subscription/cancel
 */
const cancelSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { immediate } = req.body;

  // Get user's subscription
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const updatedSubscription = await subscriptionService.cancelSubscription(
    subscription._id,
    immediate || false,
    { userId, ipAddress: req.ip }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: immediate
      ? 'Subscription cancelled immediately'
      : 'Subscription will cancel at period end',
    data: updatedSubscription,
  });
});

/**
 * Add seat to subscription
 * POST /api/v1/subscription/add-seat
 */
const addSeat = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { newUserId } = req.body;

  // Get user's subscription
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const updatedSubscription = await subscriptionService.addSeatToSubscription(
    subscription._id,
    newUserId,
    { userId, ipAddress: req.ip }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Seat added successfully',
    data: {
      subscription: updatedSubscription,
      seatsUsed: updatedSubscription.seats.used,
      seatsAvailable: updatedSubscription.seats.available,
      totalCost:
        updatedSubscription.pricePerSeat * updatedSubscription.seats.used,
    },
  });
});

/**
 * Remove seat from subscription
 * POST /api/v1/subscription/remove-seat
 */
const removeSeat = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { removeUserId } = req.body;

  // Get user's subscription
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const updatedSubscription =
    await subscriptionService.removeSeatFromSubscription(
      subscription._id,
      removeUserId,
      { userId, ipAddress: req.ip }
    );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Seat removed successfully',
    data: {
      subscription: updatedSubscription,
      seatsUsed: updatedSubscription.seats.used,
      seatsAvailable: updatedSubscription.seats.available,
      totalCost:
        updatedSubscription.pricePerSeat * updatedSubscription.seats.used,
    },
  });
});

/**
 * Check usage limit
 * GET /api/v1/subscription/usage-limit/:limitType
 */
const checkUsageLimit = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { limitType } = req.params;

  if (!['webSearch', 'deepResearch'].includes(limitType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid limit type');
  }

  const usageInfo = await subscriptionService.checkUsageLimit(
    userId,
    limitType
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Usage limit checked',
    data: usageInfo,
  });
});

/**
 * Increment usage counter
 * POST /api/v1/subscription/increment-usage
 */
const incrementUsage = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { limitType } = req.body;

  if (!['webSearch', 'deepResearch'].includes(limitType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid limit type');
  }

  await subscriptionService.incrementUsage(userId, limitType);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Usage incremented successfully',
  });
});

/**
 * Get usage statistics
 * GET /api/v1/subscription/usage-stats
 */
const getUsageStats = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const stats = {
    plan: subscription.plan,
    limits: subscription.limits,
    usage: subscription.usage,
    webSearch: {
      used: subscription.usage.webSearchUsedToday,
      limit: subscription.limits.dailyWebSearchLimit,
      remaining: Math.max(
        0,
        subscription.limits.dailyWebSearchLimit -
          subscription.usage.webSearchUsedToday
      ),
      percentage: (
        (subscription.usage.webSearchUsedToday /
          subscription.limits.dailyWebSearchLimit) *
        100
      ).toFixed(1),
    },
    deepResearch: {
      used: subscription.usage.deepResearchUsedToday,
      limit: subscription.limits.dailyDeepResearchLimit,
      remaining: Math.max(
        0,
        subscription.limits.dailyDeepResearchLimit -
          subscription.usage.deepResearchUsedToday
      ),
      percentage:
        subscription.limits.dailyDeepResearchLimit > 0
          ? (
              (subscription.usage.deepResearchUsedToday /
                subscription.limits.dailyDeepResearchLimit) *
              100
            ).toFixed(1)
          : 0,
    },
    lastResetAt: subscription.usage.lastResetAt,
  };

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Usage statistics retrieved successfully',
    data: stats,
  });
});



/**
 * Stripe webhook handler
 * POST /api/v1/subscription/webhook
 */
const handleStripeWebhook = catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret =
    config.stripe.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  console.log('Webhook received - signature present:', !!sig);
  console.log('Webhook secret configured:', !!webhookSecret);
  console.log(
    'Body type:',
    typeof req.body,
    Buffer.isBuffer(req.body) ? 'Buffer' : 'Not Buffer'
  );

  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const isValidStripeIp = await isStripeIp(clientIp);

  if (!isValidStripeIp) {
    logger.error(`[STRIPE_SECURITY_ALERT] Webhook request originating from untrusted IP: ${clientIp}`);

    // Dispatch real-time security alert to Discord/Slack
    sendSecurityAlert(
      'Untrusted Webhook IP Blocked',
      `An incoming Stripe webhook request was rejected because the sender IP did not originate from Stripe's official IP ranges.`,
      {
        senderIp: clientIp,
        userAgent: req.headers['user-agent'] || 'none',
        signaturePresent: !!sig
      }
    ).catch(() => {});

    try {
      await BillingAuditLog.create({
        action: 'webhook_failed',
        previousState: { sig },
        newState: {
          error: 'Untrusted webhook IP address source',
          ip: clientIp,
          userAgent: req.headers['user-agent'],
        },
        ipAddress: clientIp,
      });
    } catch (logErr) {
      logger.error('Failed to create untrusted IP audit log:', logErr);
    }

    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Forbidden: untrusted sender source IP'
    );
  }

  if (!webhookSecret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Webhook secret not configured'
    );
  }

  if (!sig) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing stripe-signature header'
    );
  }

  let event;
  let verificationError = null;

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2022-11-15',
    });

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
    console.log('Webhook verified successfully:', event.type);
  } catch (err) {
    logger.error('[STRIPE_SECURITY_ALERT] Webhook signature verification failed', {
      message: err.message,
      ip: clientIp,
      userAgent: req.headers['user-agent'],
    });

    // Dispatch real-time security alert for signature mismatch
    sendSecurityAlert(
      'Webhook Signature Mismatch',
      `An incoming webhook signature check failed verification. This may indicate a replay attempt or incorrect webhook secret configuration.`,
      {
        senderIp: clientIp,
        errorMessage: err.message,
        userAgent: req.headers['user-agent'] || 'none',
        signature: sig || 'none'
      }
    ).catch(() => {});

    try {
      await BillingAuditLog.create({
        action: 'webhook_failed',
        previousState: { sig },
        newState: {
          error: err.message,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
        },
        ipAddress: clientIp,
      });
    } catch (logErr) {
      logger.error('Failed to create webhook failure audit log:', logErr);
    }

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${err.message}`
    );
  }

  // Webhook Replay Protection Guard
  const existingEvent = await StripeEvent.findOne({ eventId: event.id });
  if (existingEvent) {
    console.log(`Duplicate webhook event ${event.id} discarded.`);
    return res.json({ received: true, duplicate: true });
  }
  await StripeEvent.create({ eventId: event.id });

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await subscriptionService.processStripeCheckout(session.id);
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await subscriptionService.updateSubscriptionFromStripe(subscription);
      break;
    }

    case 'invoice.payment_succeeded': {
      // Payment successful - update subscription and tenant
      const invoice = event.data.object;
      await subscriptionService.handleInvoicePaymentSucceeded(invoice);
      break;
    }

    case 'invoice.payment_failed': {
      // Payment failed - mark subscription as past_due
      const invoice = event.data.object;
      await subscriptionService.handleInvoicePaymentFailed(invoice);
      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      await subscriptionService.handleDisputeCreated(dispute);
      break;
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      await subscriptionService.handleDisputeClosed(dispute);
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

/**
 * Create Stripe Customer Billing Portal session
 * POST /api/v1/subscription/billing-portal
 */
const createBillingPortalSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const tenantId = req.body.tenantId || req.query.tenantId || null;
  const ipAddress = req.ip || 'unknown';

  const session = await subscriptionService.createBillingPortalSession(
    userId,
    tenantId,
    { ipAddress }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Billing portal session created successfully',
    data: {
      url: session.url,
    },
  });
});

export default {
  getAvailablePlans,
  getMySubscription,
  getTenantSubscription,
  createFreeSubscription,
  upgradeSubscription,
  confirmPayment,
  processCheckout,
  cancelSubscription,
  addSeat,
  removeSeat,
  checkUsageLimit,
  incrementUsage,
  getUsageStats,
  handleStripeWebhook,
  createBillingPortalSession,
};
