import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import subscriptionService from './subscription.service.js';
import ProductModel from '../products/products.model.js';
import ApiError from '../../../errors/ApiError.js';

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
    data: plans.map(plan => plan.toPublicJSON()),
  });
});

/**
 * Get current user's subscription
 * GET /api/v1/subscription/my-subscription
 */
const getMySubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const subscriptionData = await subscriptionService.getSubscriptionWithUsage(userId);

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

  const subscription = await subscriptionService.getTenantSubscription(tenantId);

  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No subscription found for this tenant');
  }

  const subscriptionData = await subscriptionService.getSubscriptionWithUsage(subscription.userId);

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

  const subscription = await subscriptionService.createFreeSubscription(userId, tenantId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Free subscription created successfully',
    data: subscription,
  });
});

/**
 * Upgrade subscription (create checkout session)
 * POST /api/v1/subscription/upgrade
 */
const upgradeSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { planName, tenantId, seats } = req.body;

  if (!planName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Plan name is required');
  }

  const initialSeats = seats || 1;
  if (initialSeats < 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Seats must be at least 1');
  }

  const checkoutSession = await subscriptionService.upgradeSubscription(
    userId,
    planName,
    tenantId,
    initialSeats
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Checkout session created successfully',
    data: checkoutSession,
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

  const subscription = await subscriptionService.processStripeCheckout(sessionId);

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
    immediate || false
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
    newUserId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Seat added successfully',
    data: {
      subscription: updatedSubscription,
      seatsUsed: updatedSubscription.seats.used,
      seatsAvailable: updatedSubscription.seats.available,
      totalCost: updatedSubscription.pricePerSeat * updatedSubscription.seats.used,
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

  const updatedSubscription = await subscriptionService.removeSeatFromSubscription(
    subscription._id,
    removeUserId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Seat removed successfully',
    data: {
      subscription: updatedSubscription,
      seatsUsed: updatedSubscription.seats.used,
      seatsAvailable: updatedSubscription.seats.available,
      totalCost: updatedSubscription.pricePerSeat * updatedSubscription.seats.used,
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

  const usageInfo = await subscriptionService.checkUsageLimit(userId, limitType);

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
      remaining: Math.max(0, subscription.limits.dailyWebSearchLimit - subscription.usage.webSearchUsedToday),
      percentage: ((subscription.usage.webSearchUsedToday / subscription.limits.dailyWebSearchLimit) * 100).toFixed(1),
    },
    deepResearch: {
      used: subscription.usage.deepResearchUsedToday,
      limit: subscription.limits.dailyDeepResearchLimit,
      remaining: Math.max(0, subscription.limits.dailyDeepResearchLimit - subscription.usage.deepResearchUsedToday),
      percentage: subscription.limits.dailyDeepResearchLimit > 0
        ? ((subscription.usage.deepResearchUsedToday / subscription.limits.dailyDeepResearchLimit) * 100).toFixed(1)
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
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Webhook secret not configured');
  }

  let event;

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Webhook signature verification failed: ${err.message}`);
  }

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

    case 'invoice.payment_succeeded':
      // Payment successful - subscription continues
      break;

    case 'invoice.payment_failed':
      // Payment failed - handle accordingly
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

export default {
  getAvailablePlans,
  getMySubscription,
  getTenantSubscription,
  createFreeSubscription,
  upgradeSubscription,
  processCheckout,
  cancelSubscription,
  addSeat,
  removeSeat,
  checkUsageLimit,
  incrementUsage,
  getUsageStats,
  handleStripeWebhook,
};
