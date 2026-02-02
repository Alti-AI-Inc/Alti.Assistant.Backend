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
 * Helper: Sync tenant with subscription data
 * Updates tenant's subscriptionId, plan, and status based on subscription
 * @param {string} tenantId - Tenant ID
 * @param {Object} subscription - Subscription document
 * @returns {Promise<Object>} Updated tenant
 */
const syncTenantWithSubscription = async (tenantId, subscription) => {
  if (!tenantId) return null;

  try {
    const updateData = {
      subscriptionId: subscription._id,
      plan: subscription.plan,
    };

    // Map subscription status to tenant status
    if (subscription.status === 'active') {
      updateData.status = 'active';
    } else if (subscription.status === 'cancelled') {
      updateData.status = 'cancelled';
    } else if (subscription.status === 'past_due') {
      updateData.status = 'suspended';
    } else if (subscription.status === 'trialing') {
      updateData.status = 'trial';
    }

    const tenant = await TenantModel.findByIdAndUpdate(tenantId, updateData, { new: true });
    logger.info(`Synced tenant ${tenantId} with subscription ${subscription._id}`);
    return tenant;
  } catch (error) {
    logger.error('Error syncing tenant with subscription:', error);
    // Don't throw - tenant sync should not block subscription operations
    return null;
  }
};

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
 * Upgrade or change subscription to a paid plan
 * Hybrid approach:
 * 1. If user has existing paid subscription -> Update the plan in Stripe
 * 2. If user has saved payment method -> Create subscription directly (no redirect)
 * 3. If no saved payment method -> Fall back to Checkout Session
 * 
 * @param {string} userId - User ID
 * @param {Object} planIdentifier - Object containing stripeProductId or planName
 * @param {string} planIdentifier.stripeProductId - Stripe Product ID (preferred)
 * @param {string} planIdentifier.planName - Plan name as fallback (explore, execute, command)
 * @param {string} tenantId - Optional tenant ID
 * @param {number} initialSeats - Initial number of seats (default: 1)
 * @returns {Promise<Object>} Subscription result or checkout session
 */
const upgradeSubscription = async (userId, planIdentifier, tenantId = null, initialSeats = 1) => {
  try {
    const { stripeProductId, planName } = planIdentifier;

    // Get plan details from database - prefer stripeProductId over planName
    let plan;
    if (stripeProductId) {
      plan = await ProductModel.findByStripeProductId(stripeProductId);
      if (!plan) {
        throw new ApiError(httpStatus.NOT_FOUND, `Plan with Stripe Product ID '${stripeProductId}' not found`);
      }
    } else if (planName) {
      // Validate plan name
      if (planName === 'free') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot upgrade to free plan. Use cancel instead.');
      }
      plan = await ProductModel.findByPlan(planName);
      if (!plan) {
        throw new ApiError(httpStatus.NOT_FOUND, `Plan '${planName}' not found`);
      }
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Either stripeProductId or planName is required');
    }

    // Validate plan is active and not free
    if (!plan.isActive) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Plan is not active');
    }
    if (plan.plan === 'free') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot upgrade to free plan. Use cancel instead.');
    }

    // Get user
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Check for existing active paid subscription
    const existingPaidSubscription = await SubscriptionModel.findOne({
      userId,
      status: 'active',
      plan: { $ne: 'free' },
    });

    // CASE 1: User already has an active paid subscription -> Change plan
    if (existingPaidSubscription) {
      // Check if trying to switch to the same plan
      if (existingPaidSubscription.plan === plan.plan) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Already subscribed to ${plan.plan} plan`);
      }

      logger.info(`Changing plan for user ${userId} from ${existingPaidSubscription.plan} to ${plan.plan}`);
      return await changePlan(existingPaidSubscription, plan, initialSeats);
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

    // Check if customer has a default payment method
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;

    // CASE 2: User has saved payment method -> Create subscription directly
    if (defaultPaymentMethod) {
      logger.info(`Creating subscription directly for user ${userId} with saved payment method`);
      return await createSubscriptionDirectly(userId, customerId, plan, tenantId, initialSeats, defaultPaymentMethod);
    }

    // CASE 3: No saved payment method -> Fall back to Checkout Session
    logger.info(`Creating checkout session for user ${userId} (no saved payment method)`);
    return await createCheckoutSession(userId, customerId, plan, tenantId, initialSeats);

  } catch (error) {
    logger.error('Error upgrading subscription:', error);
    throw error;
  }
};

/**
 * Change an existing subscription to a different plan
 * Updates the subscription in Stripe with the new price
 * @param {Object} existingSubscription - Existing subscription document
 * @param {Object} newPlan - New plan details from ProductModel
 * @param {number} seats - Number of seats
 * @returns {Promise<Object>} Updated subscription
 */
const changePlan = async (existingSubscription, newPlan, seats = null) => {
  try {
    const seatCount = seats || existingSubscription.seats.used;

    // Update subscription in Stripe - switch to new price
    const stripeSubscription = await stripe.subscriptions.retrieve(existingSubscription.stripeSubscriptionId);
    const subscriptionItemId = stripeSubscription.items.data[0].id;

    // Update the subscription item with new price
    // proration_behavior: 'create_prorations' will charge/credit the difference
    const updatedStripeSubscription = await stripe.subscriptions.update(existingSubscription.stripeSubscriptionId, {
      items: [
        {
          id: subscriptionItemId,
          price: newPlan.stripePriceId,
          quantity: seatCount,
        },
      ],
      proration_behavior: 'create_prorations', // Charge/credit difference immediately
      metadata: {
        planName: newPlan.plan,
        stripeProductId: newPlan.stripeProductId,
      },
    });

    // Update local subscription
    const updatedSubscription = await SubscriptionModel.findByIdAndUpdate(
      existingSubscription._id,
      {
        plan: newPlan.plan,
        stripePriceId: newPlan.stripePriceId,
        stripeProductId: newPlan.stripeProductId,
        pricePerSeat: newPlan.price,
        'seats.total': seatCount,
        'seats.used': seatCount,
        'seats.available': 0,
        limits: {
          dailyWebSearchLimit: newPlan.features.dailyWebSearchLimit,
          dailyDeepResearchLimit: newPlan.features.dailyDeepResearchLimit,
          canInviteTeam: newPlan.features.canInviteTeam,
          unlimitedSeats: newPlan.features.unlimitedSeats,
        },
        'billingCycle.currentPeriodStart': new Date(updatedStripeSubscription.current_period_start * 1000),
        'billingCycle.currentPeriodEnd': new Date(updatedStripeSubscription.current_period_end * 1000),
      },
      { new: true }
    );

    // Update user's current plan
    await UserModel.findByIdAndUpdate(existingSubscription.userId, {
      currentPlan: newPlan.plan,
    });

    logger.info(`Changed plan for subscription ${existingSubscription._id} to ${newPlan.plan}`);

    return {
      type: 'plan_changed',
      subscription: updatedSubscription,
      planName: newPlan.plan,
      stripeProductId: newPlan.stripeProductId,
      pricePerSeat: newPlan.price,
      seats: seatCount,
      totalAmount: newPlan.price * seatCount,
      currency: newPlan.currency,
      interval: newPlan.interval,
      message: `Successfully changed to ${newPlan.displayName || newPlan.name} plan`,
    };
  } catch (error) {
    logger.error('Error changing plan:', error);
    throw error;
  }
};

/**
 * Create subscription directly using saved payment method
 * No redirect required - instant activation
 * @param {string} userId - User ID
 * @param {string} customerId - Stripe customer ID
 * @param {Object} plan - Plan details from ProductModel
 * @param {string} tenantId - Optional tenant ID
 * @param {number} seats - Number of seats
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} Created subscription
 */
const createSubscriptionDirectly = async (userId, customerId, plan, tenantId, seats, paymentMethodId) => {
  try {
    // Create subscription in Stripe
    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: plan.stripePriceId,
          quantity: seats,
        },
      ],
      default_payment_method: paymentMethodId,
      metadata: {
        userId: userId.toString(),
        tenantId: tenantId?.toString() || '',
        planName: plan.plan,
        stripeProductId: plan.stripeProductId,
      },
      expand: ['latest_invoice.payment_intent'],
    });

    // Check if payment requires additional action (3D Secure)
    const invoice = stripeSubscription.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    if (paymentIntent && paymentIntent.status === 'requires_action') {
      // Payment requires 3D Secure authentication
      logger.info(`Subscription ${stripeSubscription.id} requires payment confirmation (3DS)`);
      return {
        type: 'requires_action',
        subscriptionId: stripeSubscription.id,
        clientSecret: paymentIntent.client_secret,
        planName: plan.plan,
        stripeProductId: plan.stripeProductId,
        pricePerSeat: plan.price,
        seats: seats,
        totalAmount: plan.price * seats,
        currency: plan.currency,
        interval: plan.interval,
        message: 'Payment requires additional authentication',
      };
    }

    if (paymentIntent && paymentIntent.status === 'requires_payment_method') {
      // Payment failed - need a different payment method
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Payment failed. Please try a different payment method.');
    }

    // Payment successful - create local subscription
    // Cancel any existing free subscription
    await SubscriptionModel.updateMany(
      { userId, status: 'active', plan: 'free' },
      { status: 'cancelled', 'billingCycle.canceledAt': new Date() }
    );

    // Get subscription item ID
    const subscriptionItem = stripeSubscription.items.data[0];

    // Create new subscription in database
    const subscription = await SubscriptionModel.create({
      userId,
      tenantId: tenantId || null,
      plan: plan.plan,
      status: 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSubscription.id,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: subscriptionItem.price.id,
      stripeProductId: plan.stripeProductId,
      seats: {
        total: seats,
        used: seats,
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
      currentPlan: plan.plan,
    });

    // Update tenant if applicable
    if (tenantId) {
      await TenantModel.findByIdAndUpdate(tenantId, {
        subscriptionId: subscription._id,
        plan: plan.plan,
      });
    }

    logger.info(`Created subscription directly for user ${userId}, subscription ${subscription._id}`);

    return {
      type: 'subscription_created',
      subscription: subscription,
      planName: plan.plan,
      stripeProductId: plan.stripeProductId,
      pricePerSeat: plan.price,
      seats: seats,
      totalAmount: plan.price * seats,
      currency: plan.currency,
      interval: plan.interval,
      message: `Successfully subscribed to ${plan.displayName || plan.name} plan`,
    };
  } catch (error) {
    logger.error('Error creating subscription directly:', error);
    throw error;
  }
};

/**
 * Create Stripe Checkout Session for users without saved payment method
 * @param {string} userId - User ID
 * @param {string} customerId - Stripe customer ID
 * @param {Object} plan - Plan details from ProductModel
 * @param {string} tenantId - Optional tenant ID
 * @param {number} seats - Number of seats
 * @returns {Promise<Object>} Checkout session details
 */
const createCheckoutSession = async (userId, customerId, plan, tenantId, seats) => {
  try {
    const subscriptionMetadata = {
      userId: userId.toString(),
      tenantId: tenantId?.toString() || '',
      planName: plan.plan,
      stripeProductId: plan.stripeProductId,
      initialSeats: seats.toString(),
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: seats,
        },
      ],
      mode: 'subscription',
      success_url: `${config.client_url}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.client_url}/subscription/cancel`,
      // Save the payment method for future use
      payment_method_collection: 'always',
      // Metadata on checkout session (for checkout.session.completed event)
      metadata: subscriptionMetadata,
      // Metadata on subscription (flows to invoices for invoice.payment_succeeded)
      subscription_data: {
        metadata: subscriptionMetadata,
      },
    });

    logger.info(`Created checkout session ${session.id} for user ${userId}`);

    return {
      type: 'checkout_session',
      sessionId: session.id,
      sessionUrl: session.url,
      planName: plan.plan,
      stripeProductId: plan.stripeProductId,
      pricePerSeat: plan.price,
      seats: seats,
      totalAmount: plan.price * seats,
      currency: plan.currency,
      interval: plan.interval,
      message: 'Redirect to checkout to complete subscription',
    };
  } catch (error) {
    logger.error('Error creating checkout session:', error);
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
 * Increments seat count and updates Stripe subscription item for billing
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

    if (!subscription.stripeSubscriptionId || !subscription.stripeSubscriptionItemId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No Stripe subscription found');
    }

    // Calculate new seat count
    const newSeatCount = subscription.seats.used + 1;

    // Update Stripe subscription item quantity for billing
    await stripe.subscriptionItems.update(subscription.stripeSubscriptionItemId, {
      quantity: newSeatCount,
      proration_behavior: 'always_invoice', // Charge immediately for the new seat
    });

    // Update local subscription
    const updatedSubscription = await SubscriptionModel.findByIdAndUpdate(
      subscriptionId,
      {
        'seats.total': newSeatCount,
        'seats.used': newSeatCount,
        'seats.available': 0,
      },
      { new: true }
    );

    logger.info(`Added seat to subscription ${subscriptionId} for user ${userId}. New quantity: ${newSeatCount}`);

    return updatedSubscription;
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

    // Sync tenant if applicable
    if (subscription.tenantId) {
      await syncTenantWithSubscription(subscription.tenantId, updatedSubscription);
    }

    return updatedSubscription;
  } catch (error) {
    logger.error('Error updating subscription from Stripe:', error);
    throw error;
  }
};

/**
 * Confirm subscription after 3D Secure authentication
 * Called after frontend confirms payment intent
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {string} userId - User ID
 * @param {string} tenantId - Optional tenant ID
 * @returns {Promise<Object>} Activated subscription
 */
const confirmSubscriptionPayment = async (subscriptionId, userId, tenantId = null) => {
  try {
    // Retrieve subscription from Stripe
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent'],
    });

    // Check payment status
    const paymentIntent = stripeSubscription.latest_invoice?.payment_intent;
    if (paymentIntent && paymentIntent.status !== 'succeeded') {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Payment not completed');
    }

    // Check if subscription already exists locally
    const existingSubscription = await SubscriptionModel.findOne({
      stripeSubscriptionId: subscriptionId,
    });

    if (existingSubscription) {
      // Update status to active
      existingSubscription.status = 'active';
      await existingSubscription.save();
      return existingSubscription;
    }

    // Get plan from metadata or subscription item
    const planName = stripeSubscription.metadata?.planName;
    const plan = await ProductModel.findByPlan(planName);
    if (!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Plan not found');
    }

    // Cancel any existing free subscription
    await SubscriptionModel.updateMany(
      { userId, status: 'active', plan: 'free' },
      { status: 'cancelled', 'billingCycle.canceledAt': new Date() }
    );

    // Create subscription in database
    const subscriptionItem = stripeSubscription.items.data[0];
    const subscription = await SubscriptionModel.create({
      userId,
      tenantId: tenantId || null,
      plan: plan.plan,
      status: 'active',
      stripeCustomerId: stripeSubscription.customer,
      stripeSubscriptionId: stripeSubscription.id,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: subscriptionItem.price.id,
      stripeProductId: plan.stripeProductId,
      seats: {
        total: subscriptionItem.quantity || 1,
        used: subscriptionItem.quantity || 1,
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

    // Update user
    await UserModel.findByIdAndUpdate(userId, {
      subscriptionId: subscription._id,
      currentPlan: plan.plan,
    });

    // Update tenant if applicable
    if (tenantId) {
      await TenantModel.findByIdAndUpdate(tenantId, {
        subscriptionId: subscription._id,
        plan: plan.plan,
      });
    }

    logger.info(`Confirmed subscription payment for ${subscriptionId}`);

    return subscription;
  } catch (error) {
    logger.error('Error confirming subscription payment:', error);
    throw error;
  }
};

/**
 * Handle invoice.payment_succeeded webhook
 * Updates subscription and tenant with payment details
 * If no subscription found, creates one using metadata from invoice
 * @param {Object} invoice - Stripe invoice object from webhook
 * @returns {Promise<Object>} Updated or created subscription
 */
const handleInvoicePaymentSucceeded = async (invoice) => {
  try {
    // Extract subscription ID from invoice
    // New API structure: parent.subscription_details.subscription
    // Fallback to subscription field for older invoices
    const stripeSubscriptionId =
      invoice.parent?.subscription_details?.subscription ||
      invoice.subscription;

    if (!stripeSubscriptionId) {
      logger.info('Invoice has no subscription - likely a one-time payment');
      return null;
    }

    // Extract metadata from subscription_details or line items
    const metadata =
      invoice.parent?.subscription_details?.metadata ||
      invoice.lines?.data?.[0]?.metadata ||
      {};

    const { userId, tenantId, planName, stripeProductId, initialSeats } = metadata;

    logger.info('Processing invoice.payment_succeeded', {
      invoiceId: invoice.id,
      stripeSubscriptionId,
      metadata,
    });

    // Try to find existing subscription
    let subscription = await SubscriptionModel.findOne({
      stripeSubscriptionId: stripeSubscriptionId,
    });

    // If not found by stripeSubscriptionId, try finding by tenantId
    if (!subscription && tenantId) {
      subscription = await SubscriptionModel.findOne({
        tenantId: tenantId,
        status: { $in: ['active', 'trialing', 'past_due'] },
      });

      // If found, update with Stripe subscription ID
      if (subscription) {
        subscription.stripeSubscriptionId = stripeSubscriptionId;
        logger.info(`Found existing subscription by tenantId, updating stripeSubscriptionId`);
      }
    }

    // Extract billing period from line items
    const lineItem = invoice.lines?.data?.[0];
    const periodStart = lineItem?.period?.start
      ? new Date(lineItem.period.start * 1000)
      : new Date();
    const periodEnd = lineItem?.period?.end
      ? new Date(lineItem.period.end * 1000)
      : null;

    // Extract Stripe IDs from line item
    const subscriptionItemId = lineItem?.parent?.subscription_item_details?.subscription_item;
    const stripePriceId = lineItem?.pricing?.price_details?.price;
    const stripeProductIdFromInvoice = lineItem?.pricing?.price_details?.product || stripeProductId;
    const quantity = lineItem?.quantity || parseInt(initialSeats) || 1;

    // If no subscription found, create a new one
    if (!subscription) {
      if (!userId) {
        logger.error('Cannot create subscription: missing userId in metadata');
        return null;
      }

      logger.info(`Creating new subscription for user ${userId} from invoice webhook`);

      // Get plan details from database
      let plan;
      if (planName) {
        plan = await ProductModel.findByPlan(planName);
      } else if (stripeProductIdFromInvoice) {
        plan = await ProductModel.findByStripeProductId(stripeProductIdFromInvoice);
      }

      if (!plan) {
        logger.error(`Plan not found for planName: ${planName}, productId: ${stripeProductIdFromInvoice}`);
        // Use default values if plan not found
        plan = {
          plan: planName || 'explore',
          price: (invoice.amount_paid / 100) / quantity,
          stripeProductId: stripeProductIdFromInvoice,
          features: {
            dailyWebSearchLimit: 100,
            dailyDeepResearchLimit: 10,
            canInviteTeam: true,
            unlimitedSeats: false,
          },
        };
      }

      // Cancel any existing free subscription for this user
      await SubscriptionModel.updateMany(
        { userId, status: 'active', plan: 'free' },
        { status: 'cancelled', 'billingCycle.canceledAt': new Date() }
      );

      // Create new subscription
      subscription = await SubscriptionModel.create({
        userId,
        tenantId: tenantId || null,
        plan: plan.plan || planName,
        status: 'active',
        stripeCustomerId: invoice.customer,
        stripeSubscriptionId: stripeSubscriptionId,
        stripeSubscriptionItemId: subscriptionItemId,
        stripePriceId: stripePriceId,
        stripeProductId: stripeProductIdFromInvoice,
        seats: {
          total: quantity,
          used: quantity,
          available: 0,
        },
        pricePerSeat: plan.price || (invoice.amount_paid / 100) / quantity,
        limits: {
          dailyWebSearchLimit: plan.features?.dailyWebSearchLimit || 100,
          dailyDeepResearchLimit: plan.features?.dailyDeepResearchLimit || 10,
          canInviteTeam: plan.features?.canInviteTeam || true,
          unlimitedSeats: plan.features?.unlimitedSeats || false,
        },
        usage: {
          webSearchUsedToday: 0,
          deepResearchUsedToday: 0,
          lastResetAt: new Date(),
        },
        billingCycle: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
        paymentStatus: 'paid',
        transactionId: invoice.id,
        invoiceUrl: invoice.hosted_invoice_url,
        price: invoice.amount_paid / 100,
      });

      // Update user's subscription reference
      await UserModel.findByIdAndUpdate(userId, {
        subscriptionId: subscription._id,
        currentPlan: plan.plan || planName,
      });

      // Update tenant if applicable
      if (tenantId) {
        await TenantModel.findByIdAndUpdate(tenantId, {
          subscriptionId: subscription._id,
          plan: plan.plan || planName,
        });
      }

      logger.info(`Created new subscription ${subscription._id} from invoice.payment_succeeded`);

      return subscription;
    }

    // Update existing subscription
    const updateData = {
      status: 'active',
      paymentStatus: 'paid',
      transactionId: invoice.id,
      invoiceUrl: invoice.hosted_invoice_url,
      price: invoice.amount_paid / 100,
    };

    // Update Stripe IDs if available
    if (subscriptionItemId) {
      updateData.stripeSubscriptionItemId = subscriptionItemId;
    }
    if (stripePriceId) {
      updateData.stripePriceId = stripePriceId;
    }
    if (stripeProductIdFromInvoice) {
      updateData.stripeProductId = stripeProductIdFromInvoice;
    }

    if (periodStart) {
      updateData['billingCycle.currentPeriodStart'] = periodStart;
    }
    if (periodEnd) {
      updateData['billingCycle.currentPeriodEnd'] = periodEnd;
    }

    const updatedSubscription = await SubscriptionModel.findByIdAndUpdate(
      subscription._id,
      updateData,
      { new: true }
    );

    logger.info(`Updated subscription ${subscription._id} from invoice.payment_succeeded`, {
      invoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      periodStart,
      periodEnd,
    });

    // Sync tenant if applicable
    if (subscription.tenantId) {
      await syncTenantWithSubscription(subscription.tenantId, updatedSubscription);
    }

    return updatedSubscription;
  } catch (error) {
    logger.error('Error handling invoice.payment_succeeded:', error);
    throw error;
  }
};

/**
 * Handle invoice.payment_failed webhook
 * Updates subscription status to past_due
 * @param {Object} invoice - Stripe invoice object from webhook
 * @returns {Promise<Object>} Updated subscription
 */
const handleInvoicePaymentFailed = async (invoice) => {
  try {
    const stripeSubscriptionId =
      invoice.parent?.subscription_details?.subscription ||
      invoice.subscription;

    if (!stripeSubscriptionId) {
      return null;
    }

    const subscription = await SubscriptionModel.findOne({
      stripeSubscriptionId: stripeSubscriptionId,
    });

    if (!subscription) {
      logger.warn(`No subscription found for Stripe subscription ID: ${stripeSubscriptionId}`);
      return null;
    }

    const updatedSubscription = await SubscriptionModel.findByIdAndUpdate(
      subscription._id,
      {
        status: 'past_due',
        paymentStatus: 'pending',
      },
      { new: true }
    );

    logger.warn(`Subscription ${subscription._id} marked as past_due due to payment failure`, {
      invoiceId: invoice.id,
    });

    // Sync tenant
    if (subscription.tenantId) {
      await syncTenantWithSubscription(subscription.tenantId, updatedSubscription);
    }

    return updatedSubscription;
  } catch (error) {
    logger.error('Error handling invoice.payment_failed:', error);
    throw error;
  }
};

export default {
  createFreeSubscription,
  upgradeSubscription,
  changePlan,
  createSubscriptionDirectly,
  createCheckoutSession,
  processStripeCheckout,
  confirmSubscriptionPayment,
  cancelSubscription,
  addSeatToSubscription,
  removeSeatFromSubscription,
  checkUsageLimit,
  incrementUsage,
  getUserSubscription,
  getTenantSubscription,
  getSubscriptionWithUsage,
  updateSubscriptionFromStripe,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
  syncTenantWithSubscription,
};
