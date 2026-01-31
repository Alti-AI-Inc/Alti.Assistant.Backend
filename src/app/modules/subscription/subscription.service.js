import Stripe from 'stripe';
import config from '../../../../config/index.js';
import SubscriptionModel from './subscription.model.js';
import ProductModel from '../products/products.model.js';
import UserModel from '../auth/auth.model.js';
import TenantModel from '../tenant/tenant.model.js';
import { getPlanDetails, getPlanLimits } from '../../../../config/subscription-plans.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js';

const stripe = new Stripe(config.stripe.stripe_secret_key);

/**
 * Subscription Service
 * Handles subscription creation, upgrades, cancellations, seat management, and usage tracking
 */

/**
 * Create a free subscription for a new user
 * @param {string} userId - User ID
 * @param {string} tenantId - Optional tenant ID
 * @returns {Promise<Object>} Created subscription
 */
const createFreeSubscription = async (userId, tenantId = null) => {
  try {
    // Check if user already has an active subscription
    const existingSubscription = await SubscriptionModel.findOne({
      userId,
      status: 'active',
    });

    if (existingSubscription) {
      logger.info(`User ${userId} already has an active subscription`);
      return existingSubscription;
    }

    // Get free plan details from database
    const freePlan = await ProductModel.findByPlan('free');
    if (!freePlan) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Free plan not found');
    }

    // Create free subscription
    const subscription = await SubscriptionModel.create({
      userId,
      tenantId,
      plan: 'free',
      status: 'active',
      pricePerSeat: 0,
      seats: {
        total: 1,
        used: 1,
        available: 0,
      },
      limits: {
        dailyWebSearchLimit: freePlan.features.dailyWebSearchLimit,
        dailyDeepResearchLimit: freePlan.features.dailyDeepResearchLimit,
        canInviteTeam: freePlan.features.canInviteTeam,
        unlimitedSeats: freePlan.features.unlimitedSeats,
      },
      usage: {
        webSearchUsedToday: 0,
        deepResearchUsedToday: 0,
        lastResetAt: new Date(),
      },
      billingCycle: {
        currentPeriodStart: new Date(),
        currentPeriodEnd: null, // Free plan doesn't expire
      },
    });

    // Update user's subscription reference
    await UserModel.findByIdAndUpdate(userId, {
      subscriptionId: subscription._id,
      currentPlan: 'free',
    });

    logger.info(`Created free subscription for user ${userId}`);

    return subscription;
  } catch (error) {
    logger.error('Error creating free subscription:', error);
    throw error;
  }
};

/**
 * Upgrade subscription to a paid plan
 * Creates a Stripe checkout session
 * @param {string} userId - User ID
 * @param {string} planName - Plan name (explore, execute, command)
 * @param {string} tenantId - Optional tenant ID
 * @param {number} initialSeats - Initial number of seats (default: 1)
 * @returns {Promise<Object>} Stripe checkout session
 */
const upgradeSubscription = async (userId, planName, tenantId = null, initialSeats = 1) => {
  try {
    // Validate plan
    if (planName === 'free') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot upgrade to free plan');
    }

    // Get plan details from database
    const plan = await ProductModel.findByPlan(planName);
    if (!plan || !plan.isActive) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Plan not found or inactive');
    }

    // Get user
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check for existing active paid subscription
    const existingSubscription = await SubscriptionModel.findOne({
      userId,
      status: 'active',
      plan: { $ne: 'free' },
    });

    if (existingSubscription) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'User already has an active paid subscription. Cancel current subscription first.'
      );
    }

    // Create or get Stripe customer
    let customerId = user.stripeAccountId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: userId.toString(),
          tenantId: tenantId?.toString() || '',
        },
      });
      customerId = customer.id;

      // Save customer ID to user
      await UserModel.findByIdAndUpdate(userId, {
        stripeAccountId: customerId,
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: initialSeats,
        },
      ],
      mode: 'subscription',
      success_url: `${config.client_url}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.client_url}/subscription/cancel`,
      metadata: {
        userId: userId.toString(),
        tenantId: tenantId?.toString() || '',
        planName,
        initialSeats: initialSeats.toString(),
      },
    });

    logger.info(`Created checkout session for user ${userId}, plan ${planName}`);

    return {
      sessionId: session.id,
      sessionUrl: session.url,
      planName,
      pricePerSeat: plan.price,
      seats: initialSeats,
      totalAmount: plan.price * initialSeats,
      currency: plan.currency,
      interval: plan.interval,
    };
  } catch (error) {
    logger.error('Error upgrading subscription:', error);
    throw error;
  }
};

/**
 * Process successful Stripe checkout
 * Called by webhook after successful payment
 * @param {string} sessionId - Stripe checkout session ID
 * @returns {Promise<Object>} Created subscription
 */
const processStripeCheckout = async (sessionId) => {
  try {
    // Retrieve checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'line_items'],
    });

    if (session.payment_status !== 'paid') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment not completed');
    }

    const { userId, tenantId, planName } = session.metadata;
    const stripeSubscription = session.subscription;

    if (typeof stripeSubscription === 'string') {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Subscription not expanded');
    }

    // Get plan details
    const plan = await ProductModel.findByPlan(planName);
    if (!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Plan not found');
    }

    // Get subscription item ID (for updating quantity later)
    const subscriptionItem = stripeSubscription.items.data[0];
    const quantity = subscriptionItem.quantity || 1;

    // Cancel any existing free subscription
    await SubscriptionModel.updateMany(
      { userId, status: 'active', plan: 'free' },
      { status: 'cancelled', 'billingCycle.canceledAt': new Date() }
    );

    // Create new paid subscription
    const subscription = await SubscriptionModel.create({
      userId,
      tenantId: tenantId || null,
      plan: planName,
      status: 'active',
      stripeCustomerId: session.customer,
      stripeSubscriptionId: stripeSubscription.id,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: subscriptionItem.price.id,
      stripeProductId: plan.stripeProductId,
      seats: {
        total: quantity,
        used: quantity,
        available: 0,
      },
      pricePerSeat: plan.price,
      limits: {
        dailyWebSearchLimit: plan.features.dailyWebSearchLimit,
        dailyDeepResearchLimit: plan.features.dailyDeepResearchLimit,
        canInviteTeam: plan.features.canInviteTeam,
        unlimitedSeats: plan.features.unlimitedSeats,
      },
      usage: {
        webSearchUsedToday: 0,
        deepResearchUsedToday: 0,
        lastResetAt: new Date(),
      },
      billingCycle: {
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      },
    });

    // Update user's subscription reference
    await UserModel.findByIdAndUpdate(userId, {
      subscriptionId: subscription._id,
      currentPlan: planName,
    });

    // Update tenant if applicable
    if (tenantId) {
      await TenantModel.findByIdAndUpdate(tenantId, {
        subscriptionId: subscription._id,
        plan: planName,
      });
    }

    logger.info(`Processed checkout for user ${userId}, subscription ${subscription._id}`);

    return subscription;
  } catch (error) {
    logger.error('Error processing checkout:', error);
    throw error;
  }
};

/**
 * Cancel subscription
 * Downgrades to free plan at period end
 * @param {string} subscriptionId - Subscription ID
 * @param {boolean} immediate - Cancel immediately (default: false, cancel at period end)
 * @returns {Promise<Object>} Updated subscription
 */
const cancelSubscription = async (subscriptionId, immediate = false) => {
  try {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    if (subscription.plan === 'free') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel free subscription');
    }

    if (subscription.status === 'cancelled') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Subscription already cancelled');
    }

    // Cancel in Stripe
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: !immediate,
      });

      if (immediate) {
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      }
    }

    // Update subscription
    const updateData = {
      status: immediate ? 'cancelled' : 'active',
      'billingCycle.cancelAt': immediate ? null : subscription.billingCycle.currentPeriodEnd,
      'billingCycle.canceledAt': immediate ? new Date() : null,
    };

    if (immediate) {
      // Downgrade to free immediately
      const freePlan = await ProductModel.findByPlan('free');
      updateData.plan = 'free';
      updateData.seats = { total: 1, used: 1, available: 0 };
      updateData.pricePerSeat = 0;
      updateData.limits = {
        dailyWebSearchLimit: freePlan.features.dailyWebSearchLimit,
        dailyDeepResearchLimit: freePlan.features.dailyDeepResearchLimit,
        canInviteTeam: false,
        unlimitedSeats: false,
      };
    }

    const updatedSubscription = await SubscriptionModel.findByIdAndUpdate(
      subscriptionId,
      updateData,
      { new: true }
    );

    // Update user
    if (immediate) {
      await UserModel.findByIdAndUpdate(subscription.userId, {
        currentPlan: 'free',
      });
    }

    logger.info(`Cancelled subscription ${subscriptionId}, immediate: ${immediate}`);

    return updatedSubscription;
  } catch (error) {
    logger.error('Error cancelling subscription:', error);
    throw error;
  }
};

/**
 * Add a seat to subscription
 * Increments seat count and updates Stripe
 * @param {string} subscriptionId - Subscription ID
 * @param {string} userId - User ID being added
 * @returns {Promise<Object>} Updated subscription
 */
const addSeatToSubscription = async (subscriptionId, userId) => {
  try {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    if (subscription.plan === 'free') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot add seats to free plan');
    }

    if (subscription.status !== 'active') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot add seats to inactive subscription');
    }

    // Call instance method to add seat (handles Stripe update)
    await subscription.addSeat();

    logger.info(`Added seat to subscription ${subscriptionId} for user ${userId}`);

    return subscription;
  } catch (error) {
    logger.error('Error adding seat:', error);
    throw error;
  }
};

/**
 * Remove a seat from subscription
 * Decrements seat count and updates Stripe
 * @param {string} subscriptionId - Subscription ID
 * @param {string} userId - User ID being removed
 * @returns {Promise<Object>} Updated subscription
 */
const removeSeatFromSubscription = async (subscriptionId, userId) => {
  try {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    if (subscription.plan === 'free') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot remove seats from free plan');
    }

    if (subscription.seats.used <= 1) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot remove last seat (owner required)');
    }

    // Call instance method to remove seat (handles Stripe update)
    await subscription.removeSeat();

    logger.info(`Removed seat from subscription ${subscriptionId} for user ${userId}`);

    return subscription;
  } catch (error) {
    logger.error('Error removing seat:', error);
    throw error;
  }
};

/**
 * Check usage limit for a user
 * @param {string} userId - User ID
 * @param {string} limitType - 'webSearch' or 'deepResearch'
 * @returns {Promise<Object>} { allowed, remaining, limit }
 */
const checkUsageLimit = async (userId, limitType) => {
  try {
    const subscription = await SubscriptionModel.findByUser(userId);
    if (!subscription) {
      // No subscription = use free plan limits
      const freePlan = await ProductModel.findByPlan('free');
      return {
        allowed: false,
        remaining: 0,
        limit: limitType === 'webSearch' ? freePlan.features.dailyWebSearchLimit : 0,
        message: 'No active subscription. Please upgrade.',
      };
    }

    const hasReached = await subscription.hasReachedLimit(limitType);

    let limit, used;
    if (limitType === 'webSearch') {
      limit = subscription.limits.dailyWebSearchLimit;
      used = subscription.usage.webSearchUsedToday;
    } else if (limitType === 'deepResearch') {
      limit = subscription.limits.dailyDeepResearchLimit;
      used = subscription.usage.deepResearchUsedToday;
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid limit type');
    }

    return {
      allowed: !hasReached,
      remaining: Math.max(0, limit - used),
      limit,
      used,
      message: hasReached ? `Daily ${limitType} limit reached` : 'Usage allowed',
    };
  } catch (error) {
    logger.error('Error checking usage limit:', error);
    throw error;
  }
};

/**
 * Increment usage counter
 * @param {string} userId - User ID
 * @param {string} limitType - 'webSearch' or 'deepResearch'
 * @returns {Promise<void>}
 */
const incrementUsage = async (userId, limitType) => {
  try {
    const subscription = await SubscriptionModel.findByUser(userId);
    if (!subscription) {
      logger.warn(`No subscription found for user ${userId}`);
      return;
    }

    await subscription.incrementUsage(limitType);

    logger.info(`Incremented ${limitType} usage for user ${userId}`);
  } catch (error) {
    logger.error('Error incrementing usage:', error);
    // Don't throw - usage tracking should not block requests
  }
};

/**
 * Get user's active subscription
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Subscription or null
 */
const getUserSubscription = async (userId) => {
  try {
    const subscription = await SubscriptionModel.findByUser(userId);
    return subscription;
  } catch (error) {
    logger.error('Error getting user subscription:', error);
    throw error;
  }
};

/**
 * Get tenant's subscription
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Subscription or null
 */
const getTenantSubscription = async (tenantId) => {
  try {
    const subscription = await SubscriptionModel.findByTenant(tenantId);
    return subscription;
  } catch (error) {
    logger.error('Error getting tenant subscription:', error);
    throw error;
  }
};

/**
 * Get subscription with usage summary
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Subscription with usage details
 */
const getSubscriptionWithUsage = async (userId) => {
  try {
    const subscription = await SubscriptionModel.findByUser(userId);
    if (!subscription) {
      return null;
    }

    const plan = await ProductModel.findByPlan(subscription.plan);

    return {
      subscription,
      plan: plan?.toPublicJSON(),
      usage: {
        webSearch: {
          used: subscription.usage.webSearchUsedToday,
          limit: subscription.limits.dailyWebSearchLimit,
          remaining: Math.max(0, subscription.limits.dailyWebSearchLimit - subscription.usage.webSearchUsedToday),
          percentage: (subscription.usage.webSearchUsedToday / subscription.limits.dailyWebSearchLimit * 100).toFixed(1),
        },
        deepResearch: {
          used: subscription.usage.deepResearchUsedToday,
          limit: subscription.limits.dailyDeepResearchLimit,
          remaining: Math.max(0, subscription.limits.dailyDeepResearchLimit - subscription.usage.deepResearchUsedToday),
          percentage: subscription.limits.dailyDeepResearchLimit > 0
            ? (subscription.usage.deepResearchUsedToday / subscription.limits.dailyDeepResearchLimit * 100).toFixed(1)
            : 0,
        },
      },
      seats: {
        total: subscription.seats.total,
        used: subscription.seats.used,
        available: subscription.seats.available,
        costPerSeat: subscription.pricePerSeat,
        totalCost: subscription.pricePerSeat * subscription.seats.used,
      },
      billingCycle: subscription.billingCycle,
    };
  } catch (error) {
    logger.error('Error getting subscription with usage:', error);
    throw error;
  }
};

/**
 * Update subscription from Stripe webhook
 * @param {Object} stripeSubscription - Stripe subscription object
 * @returns {Promise<Object>} Updated subscription
 */
const updateSubscriptionFromStripe = async (stripeSubscription) => {
  try {
    const subscription = await SubscriptionModel.findOne({
      stripeSubscriptionId: stripeSubscription.id,
    });

    if (!subscription) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found');
    }

    // Map Stripe status to our status
    let status = 'active';
    if (stripeSubscription.status === 'canceled') {
      status = 'cancelled';
    } else if (stripeSubscription.status === 'past_due') {
      status = 'past_due';
    } else if (stripeSubscription.status === 'incomplete') {
      status = 'incomplete';
    } else if (stripeSubscription.status === 'trialing') {
      status = 'trialing';
    }

    // Get quantity from subscription item
    const subscriptionItem = stripeSubscription.items.data[0];
    const quantity = subscriptionItem.quantity || subscription.seats.used;

    // Update subscription
    const updateData = {
      status,
      'seats.total': quantity,
      'seats.used': quantity,
      'billingCycle.currentPeriodStart': new Date(stripeSubscription.current_period_start * 1000),
      'billingCycle.currentPeriodEnd': new Date(stripeSubscription.current_period_end * 1000),
    };

    if (stripeSubscription.cancel_at) {
      updateData['billingCycle.cancelAt'] = new Date(stripeSubscription.cancel_at * 1000);
    }

    if (stripeSubscription.canceled_at) {
      updateData['billingCycle.canceledAt'] = new Date(stripeSubscription.canceled_at * 1000);
    }

    const updatedSubscription = await SubscriptionModel.findByIdAndUpdate(
      subscription._id,
      updateData,
      { new: true }
    );

    logger.info(`Updated subscription ${subscription._id} from Stripe webhook`);

    return updatedSubscription;
  } catch (error) {
    logger.error('Error updating subscription from Stripe:', error);
    throw error;
  }
};

export default {
  createFreeSubscription,
  upgradeSubscription,
  processStripeCheckout,
  cancelSubscription,
  addSeatToSubscription,
  removeSeatFromSubscription,
  checkUsageLimit,
  incrementUsage,
  getUserSubscription,
  getTenantSubscription,
  getSubscriptionWithUsage,
  updateSubscriptionFromStripe,
};
