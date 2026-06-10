import mongoose from 'mongoose';
import Stripe from 'stripe';
import { PubSub } from '@google-cloud/pubsub';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

// GCP Pub/Sub client for offloading background tasks
const pubSubClient = new PubSub({ projectId: config.gcp.projectId });
const subscriptionTopic = pubSubClient.topic(
  config.gcp.pubsub.subscriptionTopic
);

/**
 * Subscription Model Schema
 * Manages user/tenant subscriptions with seat-based billing
 */
const SubscriptionSchema = new mongoose.Schema(
  {
    // User/Tenant Association
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
      sparse: true, // Allow multiple null values
    },

    // Plan Details
    plan: {
      type: String,
      required: true,
      enum: ['free', 'explore', 'execute', 'command'],
      default: 'free',
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'],
      default: 'active',
      index: true,
    },

    // Stripe Integration
    stripeCustomerId: {
      type: String,
    },
    stripeSubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // No default - undefined allows sparse index to work properly
    },
    stripeSubscriptionItemId: {
      type: String,
      // Used to update quantity in Stripe
    },
    stripePriceId: {
      type: String,
    },
    stripeProductId: {
      type: String,
    },

    // Seat Management (for team subscriptions)
    seats: {
      total: {
        type: Number,
        default: 1,
        min: 1,
      },
      used: {
        type: Number,
        default: 1,
        min: 1,
      },
      available: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    pricePerSeat: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Usage Limits (from plan)
    limits: {
      dailyWebSearchLimit: {
        type: Number,
        required: true,
        default: 10,
      },
      dailyDeepResearchLimit: {
        type: Number,
        required: true,
        default: 0,
      },
      canInviteTeam: {
        type: Boolean,
        required: true,
        default: false,
      },
      unlimitedSeats: {
        type: Boolean,
        required: true,
        default: false,
      },
    },

    // Daily Usage Tracking
    usage: {
      webSearchUsedToday: {
        type: Number,
        default: 0,
        min: 0,
      },
      deepResearchUsedToday: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastResetAt: {
        type: Date,
        default: Date.now,
      },
      // Legacy fields (from old payment model)
      promptsUsed: {
        type: Number,
        default: 0,
      },
      imagesUsed: {
        type: Number,
        default: 0,
      },
    },

    // Legacy Payment Fields (from old payment.model.js)
    // Kept for backwards compatibility
    transactionId: {
      type: String,
      default: null,
    },
    price: {
      type: Number,
      default: null,
    },
    duration: {
      type: String,
      enum: ['month', 'year'],
      default: 'month',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'canceled', 'expired', 'pending'],
      default: null,
    },
    invoiceUrl: {
      type: String,
      default: null,
    },

    // Billing Information
    billingCycle: {
      currentPeriodStart: {
        type: Date,
        default: null,
      },
      currentPeriodEnd: {
        type: Date,
        default: null,
      },
      cancelAt: {
        type: Date,
        default: null,
      },
      canceledAt: {
        type: Date,
        default: null,
      },
    },

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
SubscriptionSchema.index({ userId: 1, tenantId: 1 });
SubscriptionSchema.index({ plan: 1, status: 1 });
SubscriptionSchema.index({ status: 1, 'billingCycle.currentPeriodEnd': 1 });
SubscriptionSchema.index({ createdAt: -1 });

// Virtual: Calculate available seats
SubscriptionSchema.virtual('availableSeats').get(function () {
  return this.seats.total - this.seats.used;
});

// Pre-save hook: Update available seats
SubscriptionSchema.pre('save', function (next) {
  this.seats.available = Math.max(0, this.seats.total - this.seats.used);
  next();
});

/**
 * Instance Methods
 */

// Check if user has reached daily limit
SubscriptionSchema.methods.hasReachedLimit = function (limitType) {
  const now = new Date();
  const lastReset = new Date(this.usage.lastResetAt);
  const daysDiff = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));

  // Reset if new day
  if (daysDiff >= 1) {
    this.usage.webSearchUsedToday = 0;
    this.usage.deepResearchUsedToday = 0;
    this.usage.lastResetAt = now;
  }

  if (limitType === 'webSearch') {
    return this.usage.webSearchUsedToday >= this.limits.dailyWebSearchLimit;
  } else if (limitType === 'deepResearch') {
    return (
      this.usage.deepResearchUsedToday >= this.limits.dailyDeepResearchLimit
    );
  }

  return false;
};

// Increment usage counter
SubscriptionSchema.methods.incrementUsage = async function (limitType) {
  const now = new Date();
  const lastReset = new Date(this.usage.lastResetAt);
  const daysDiff = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));

  // Reset if new day
  if (daysDiff >= 1) {
    this.usage.webSearchUsedToday = 0;
    this.usage.deepResearchUsedToday = 0;
    this.usage.lastResetAt = now;
  }

  if (limitType === 'webSearch') {
    this.usage.webSearchUsedToday += 1;
  } else if (limitType === 'deepResearch') {
    this.usage.deepResearchUsedToday += 1;
  }

  await this.save();
};

// Reset daily usage counters
SubscriptionSchema.methods.resetDailyUsage = async function () {
  this.usage.webSearchUsedToday = 0;
  this.usage.deepResearchUsedToday = 0;
  this.usage.lastResetAt = new Date();
  await this.save();
};

// Check if plan allows team invitations
SubscriptionSchema.methods.canInviteTeam = function () {
  return this.limits.canInviteTeam;
};

// Add seat to subscription (offloads Stripe update to a background worker)
SubscriptionSchema.methods.addSeat = async function () {
  if (this.plan === 'free') {
    throw new Error('Free plan does not support multiple seats');
  }

  if (!this.stripeSubscriptionId || !this.stripeSubscriptionItemId) {
    throw new Error('No Stripe subscription found');
  }

  try {
    // 1. Optimistically update the local database state for immediate UI feedback.
    this.seats.used += 1;
    this.seats.total = this.seats.used; // Keep total in sync
    await this.save();

    // 2. Offload the external Stripe API call to a background worker via Pub/Sub.
    // This prevents blocking the request and makes the API more resilient.
    const payload = {
      subscriptionId: this._id.toString(),
      stripeSubscriptionItemId: this.stripeSubscriptionItemId,
      newQuantity: this.seats.used,
      tenantId: this.tenantId ? this.tenantId.toString() : null,
      action: 'ADD_SEAT',
    };
    await subscriptionTopic.publishMessage({ json: payload });

    logger.info(
      `Added seat to subscription ${this._id} locally. New quantity: ${this.seats.used}. Offloaded Stripe update to background worker.`
    );
    return this;
  } catch (error) {
    logger.error('Error adding seat to subscription:', error);
    // In a production system, consider a compensating transaction if the DB save succeeds
    // but the message publish fails, to avoid inconsistent state.
    throw error;
  }
};

// Remove seat from subscription (offloads Stripe update to a background worker)
SubscriptionSchema.methods.removeSeat = async function () {
  if (this.plan === 'free') {
    throw new Error('Free plan does not support seat management');
  }

  if (this.seats.used <= 1) {
    throw new Error('Cannot remove last seat (owner must remain)');
  }

  if (!this.stripeSubscriptionId || !this.stripeSubscriptionItemId) {
    throw new Error('No Stripe subscription found');
  }

  try {
    // 1. Optimistically update the local database state for immediate UI feedback.
    this.seats.used -= 1;
    this.seats.total = this.seats.used; // Keep total in sync
    await this.save();

    // 2. Offload the external Stripe API call and any subsequent DB updates (like Tenant limits)
    // to a background worker. This ensures the main request thread is not blocked.
    const payload = {
      subscriptionId: this._id.toString(),
      stripeSubscriptionItemId: this.stripeSubscriptionItemId,
      newQuantity: this.seats.used,
      tenantId: this.tenantId ? this.tenantId.toString() : null,
      action: 'REMOVE_SEAT',
    };
    await subscriptionTopic.publishMessage({ json: payload });

    logger.info(
      `Removed seat from subscription ${this._id} locally. New quantity: ${this.seats.used}. Offloaded Stripe/Tenant update to background worker.`
    );
    return this;
  } catch (error) {
    logger.error('Error removing seat from subscription:', error);
    throw error;
  }
};

// Get available seats
SubscriptionSchema.methods.getAvailableSeats = function () {
  return Math.max(0, this.seats.total - this.seats.used);
};

// Calculate seat cost
SubscriptionSchema.methods.getSeatCost = function () {
  return {
    pricePerSeat: this.pricePerSeat,
    totalSeats: this.seats.total,
    usedSeats: this.seats.used,
    monthlyCost: this.pricePerSeat * this.seats.used,
  };
};

/**
 * Static Methods
 */

// Find subscription by user ID
SubscriptionSchema.statics.findByUser = function (userId) {
  return this.findOne({ userId, status: 'active' });
};

// Find subscription by tenant ID
SubscriptionSchema.statics.findByTenant = function (tenantId) {
  return this.findOne({ tenantId, status: 'active' });
};

// Find all active subscriptions
SubscriptionSchema.statics.findActiveSubscriptions = function () {
  return this.find({ status: 'active' });
};

// Find subscriptions expiring soon
SubscriptionSchema.statics.findExpiring = function (daysFromNow = 7) {
  const now = new Date();
  const futureDate = new Date(
    now.getTime() + daysFromNow * 24 * 60 * 60 * 1000
  );

  return this.find({
    status: 'active',
    'billingCycle.currentPeriodEnd': {
      $gte: now,
      $lte: futureDate,
    },
  });
};

// Find subscriptions needing usage reset
SubscriptionSchema.statics.findNeedingReset = function () {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return this.find({
    status: 'active',
    'usage.lastResetAt': { $lt: yesterday },
  });
};

const Subscription = mongoose.model('Subscription', SubscriptionSchema);

export default Subscription;