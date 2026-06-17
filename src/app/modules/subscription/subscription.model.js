import mongoose from 'mongoose';
import Stripe from 'stripe';
import { PubSub } from '@google-cloud/pubsub';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * @constant {Stripe} stripe
 * @description The configured Stripe SDK instance for interacting with the Stripe API.
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  // CVE-AGENT: Updated Stripe API version to a recent stable release for security, compliance, and new features.
  apiVersion: '2024-04-10',
});

/**
 * @constant {PubSub} pubSubClient
 * @description The Google Cloud Pub/Sub client for publishing messages to topics.
 * Used for offloading background tasks like updating Stripe.
 */
const pubSubClient = new PubSub({ projectId: config.gcp.projectId });

/**
 * @constant {Topic} subscriptionTopic
 * @description The Pub/Sub topic for subscription-related background tasks.
 */
const subscriptionTopic = pubSubClient.topic(
  config.gcp.pubsub.subscriptionTopic
);

/**
 * @class Subscription
 * @description Mongoose schema for managing user and tenant subscriptions.
 * This model handles plan details, seat-based billing, usage tracking,
 * and integration with the Stripe payment gateway.
 * @property {mongoose.Schema.Types.ObjectId} userId - The user associated with the subscription.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId] - The tenant associated with the subscription (for team plans).
 * @property {string} plan - The name of the subscription plan (e.g., 'free', 'explore').
 * @property {string} status - The current status of the subscription (e.g., 'active', 'cancelled').
 * @property {string} [stripeCustomerId] - The Stripe Customer ID.
 * @property {string} [stripeSubscriptionId] - The Stripe Subscription ID.
 * @property {string} [stripeSubscriptionItemId] - The Stripe Subscription Item ID, used for quantity updates.
 * @property {string} [stripePriceId] - The Stripe Price ID for the current plan.
 * @property {string} [stripeProductId] - The Stripe Product ID for the current plan.
 * @property {object} seats - Seat management for team subscriptions.
 * @property {number} seats.total - The total number of seats purchased.
 * @property {number} seats.used - The number of seats currently in use.
 * @property {number} seats.available - The number of available seats (calculated).
 * @property {number} pricePerSeat - The cost of a single seat for the current plan.
 * @property {object} limits - Usage limits defined by the subscription plan.
 * @property {number} limits.dailyWebSearchLimit - The maximum number of web searches allowed per day.
 * @property {number} limits.dailyDeepResearchLimit - The maximum number of deep research tasks allowed per day.
 * @property {boolean} limits.canInviteTeam - Whether the plan allows inviting team members.
 * @property {boolean} limits.unlimitedSeats - Whether the plan allows unlimited seats.
 * @property {object} usage - Tracks daily resource consumption.
 * @property {number} usage.webSearchUsedToday - The number of web searches used today.
 * @property {number} usage.deepResearchUsedToday - The number of deep research tasks used today.
 * @property {Date} usage.lastResetAt - The timestamp of the last usage counter reset.
 * @property {object} billingCycle - Information about the current billing period.
 * @property {Date} [billingCycle.currentPeriodStart] - Start date of the current billing period.
 * @property {Date} [billingCycle.currentPeriodEnd] - End date of the current billing period.
 * @property {Date} [billingCycle.cancelAt] - If cancellation is scheduled, the date it will occur.
 * @property {Date} [billingCycle.canceledAt] - The date the subscription was actually canceled.
 * @property {object} [metadata] - A flexible object for storing additional information.
 * @property {Date} createdAt - The timestamp when the document was created.
 * @property {Date} updatedAt - The timestamp when the document was last updated.
 */
const SubscriptionSchema = new mongoose.Schema(
  {
    // User/Tenant Association
    /**
     * The user who owns the subscription.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /**
     * The tenant associated with the subscription, for team-based plans.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Tenant
     * @default null
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
      sparse: true, // Allow multiple null values
    },

    // Plan Details
    /**
     * The name of the subscription plan.
     * @type {string}
     * @enum ['free', 'explore', 'execute', 'command']
     * @default 'free'
     * @required
     */
    plan: {
      type: String,
      required: true,
      enum: ['free', 'explore', 'execute', 'command'],
      default: 'free',
      index: true,
    },
    /**
     * The current status of the subscription.
     * @type {string}
     * @enum ['active', 'cancelled', 'past_due', 'trialing', 'incomplete']
     * @default 'active'
     * @required
     */
    status: {
      type: String,
      required: true,
      enum: ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'],
      default: 'active',
      index: true,
    },

    // Stripe Integration
    /**
     * The Stripe Customer ID associated with this subscription.
     * @type {string}
     */
    stripeCustomerId: {
      type: String,
    },
    /**
     * The Stripe Subscription ID. This is the primary link to the Stripe subscription object.
     * @type {string}
     * @unique
     */
    stripeSubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // No default - undefined allows sparse index to work properly
    },
    /**
     * The Stripe Subscription Item ID. Used to update the quantity (seats) of the subscription.
     * @type {string}
     */
    stripeSubscriptionItemId: {
      type: String,
      // Used to update quantity in Stripe
    },
    /**
     * The Stripe Price ID for the current plan and billing interval.
     * @type {string}
     */
    stripePriceId: {
      type: String,
    },
    /**
     * The Stripe Product ID associated with the subscription plan.
     * @type {string}
     */
    stripeProductId: {
      type: String,
    },
    stripeMeteredItems: {
      researchItemId: { type: String, default: null },
      imageItemId: { type: String, default: null },
      videoItemId: { type: String, default: null },
      taskItemId: { type: String, default: null },
      workflowItemId: { type: String, default: null },
      searchItemId: { type: String, default: null },
      writeItemId: { type: String, default: null },
      codeItemId: { type: String, default: null },
      projectsItemId: { type: String, default: null },
      modelsItemId: { type: String, default: null },
      knowledgeItemId: { type: String, default: null },
    },

    // Seat Management (for team subscriptions)
    /**
     * Manages the number of seats for team-based plans.
     * @type {object}
     */
    seats: {
      /**
       * The total number of seats purchased.
       * @type {number}
       * @default 1
       */
      total: {
        type: Number,
        default: 1,
        min: 1,
      },
      /**
       * The number of seats currently occupied by team members.
       * @type {number}
       * @default 1
       */
      used: {
        type: Number,
        default: 1,
        min: 1,
      },
      /**
       * The number of available seats. This is a calculated field.
       * @type {number}
       * @default 0
       */
      available: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    /**
     * The price per seat for the current plan.
     * @type {number}
     * @default 0
     */
    pricePerSeat: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Usage Limits (from plan)
    /**
     * Defines the usage limits associated with the subscription plan.
     * @type {object}
     */
    limits: {
      /**
       * The maximum number of web searches allowed per day.
       * @type {number}
       * @default 10
       * @required
       */
      dailyWebSearchLimit: {
        type: Number,
        required: true,
        default: 10,
      },
      /**
       * The maximum number of deep research tasks allowed per day.
       * @type {number}
       * @default 0
       * @required
       */
      dailyDeepResearchLimit: {
        type: Number,
        required: true,
        default: 0,
      },
      /**
       * Indicates if the plan allows inviting team members.
       * @type {boolean}
       * @default false
       * @required
       */
      canInviteTeam: {
        type: Boolean,
        required: true,
        default: false,
      },
      /**
       * Indicates if the plan supports unlimited seats.
       * @type {boolean}
       * @default false
       * @required
       */
      unlimitedSeats: {
        type: Boolean,
        required: true,
        default: false,
      },
      // Monthly allowances (pool-based)
      researchLimit: { type: Number, default: 0 },
      imageLimit: { type: Number, default: 0 },
      videoLimit: { type: Number, default: 0 },
      taskLimit: { type: Number, default: 0 },
      workflowLimit: { type: Number, default: 0 },
      searchLimit: { type: Number, default: 0 },
      writeLimit: { type: Number, default: 0 },
      codeLimit: { type: Number, default: 0 },
      projectsLimit: { type: Number, default: 0 },
      modelsLimit: { type: Number, default: 0 },
      knowledgeLimit: { type: Number, default: 0 },
    },

    // Daily & Monthly Usage Tracking
    /**
     * Tracks the consumption of limited resources.
     * @type {object}
     */
    usage: {
      /**
       * The number of web searches performed today.
       * @type {number}
       * @default 0
       */
      webSearchUsedToday: {
        type: Number,
        default: 0,
        min: 0,
      },
      /**
       * The number of deep research tasks performed today.
       * @type {number}
       * @default 0
       */
      deepResearchUsedToday: {
        type: Number,
        default: 0,
        min: 0,
      },
      /**
       * The timestamp when the daily usage counters were last reset.
       * @type {Date}
       * @default Date.now
       */
      lastResetAt: {
        type: Date,
        default: Date.now,
      },
      // Monthly consumption counters
      researchMonthlyUsed: { type: Number, default: 0, min: 0 },
      imageMonthlyUsed: { type: Number, default: 0, min: 0 },
      videoMonthlyUsed: { type: Number, default: 0, min: 0 },
      taskMonthlyUsed: { type: Number, default: 0, min: 0 },
      workflowMonthlyUsed: { type: Number, default: 0, min: 0 },
      searchMonthlyUsed: { type: Number, default: 0, min: 0 },
      writeMonthlyUsed: { type: Number, default: 0, min: 0 },
      codeMonthlyUsed: { type: Number, default: 0, min: 0 },
      projectsMonthlyUsed: { type: Number, default: 0, min: 0 },
      modelsMonthlyUsed: { type: Number, default: 0, min: 0 },
      knowledgeMonthlyUsed: { type: Number, default: 0, min: 0 },
      cycleStartedAt: { type: Date, default: Date.now },

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
    /**
     * Stores details about the current billing cycle from Stripe.
     * @type {object}
     */
    billingCycle: {
      /**
       * The start date of the current billing period.
       * @type {Date}
       */
      currentPeriodStart: {
        type: Date,
        default: null,
      },
      /**
       * The end date of the current billing period.
       * @type {Date}
       */
      currentPeriodEnd: {
        type: Date,
        default: null,
      },
      /**
       * If cancellation is scheduled, this is the date it will take effect.
       * @type {Date}
       */
      cancelAt: {
        type: Date,
        default: null,
      },
      /**
       * The timestamp when the subscription was definitively canceled.
       * @type {Date}
       */
      canceledAt: {
        type: Date,
        default: null,
      },
    },

    // Metadata
    /**
     * A flexible field for storing any additional, unstructured data.
     * @type {mongoose.Schema.Types.Mixed}
     */
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
// OPTIMIZATION: Added index to support efficient querying for daily usage resets by background jobs.
SubscriptionSchema.index({ status: 1, 'usage.lastResetAt': 1 });
SubscriptionSchema.index({ createdAt: -1 });

/**
 * @virtual availableSeats
 * @description Calculates the number of available seats by subtracting used seats from the total.
 * @returns {number} The number of available seats.
 */
SubscriptionSchema.virtual('availableSeats').get(function () {
  return this.seats.total - this.seats.used;
});

/**
 * @hook pre('save')
 * @description Mongoose middleware that runs before a `save` operation.
 * It ensures the `seats.available` field is correctly calculated and updated.
 */
SubscriptionSchema.pre('save', function (next) {
  this.seats.available = Math.max(0, this.seats.total - this.seats.used);
  next();
});

/**
 * Instance Methods
 */

/**
 * Checks if the user has reached their daily usage limit for a specific feature.
 * Automatically resets the daily counters if a new day has started.
 * @memberof Subscription
 * @instance
 * @param {'webSearch' | 'deepResearch'} limitType - The type of limit to check.
 * @returns {boolean} `true` if the limit has been reached, `false` otherwise.
 */
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

/**
 * Increments the usage counter for a specific feature.
 * Automatically resets daily counters if a new day has started before incrementing.
 * @memberof Subscription
 * @instance
 * @param {'webSearch' | 'deepResearch'} limitType - The type of usage to increment.
 * @returns {Promise<void>} A promise that resolves when the subscription is saved.
 */
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

/**
 * Resets all daily usage counters to zero and updates the last reset timestamp.
 * @memberof Subscription
 * @instance
 * @returns {Promise<void>} A promise that resolves when the subscription is saved.
 */
SubscriptionSchema.methods.resetDailyUsage = async function () {
  this.usage.webSearchUsedToday = 0;
  this.usage.deepResearchUsedToday = 0;
  this.usage.lastResetAt = new Date();
  await this.save();
};

/**
 * Checks if the current subscription plan allows inviting team members.
 * @memberof Subscription
 * @instance
 * @returns {boolean} `true` if team invitations are allowed, `false` otherwise.
 */
SubscriptionSchema.methods.canInviteTeam = function () {
  return this.limits.canInviteTeam;
};

/**
 * Adds a seat to the subscription.
 * This method performs an optimistic update on the local database for immediate UI feedback,
 * then offloads the actual Stripe API call to a background worker via Google Cloud Pub/Sub.
 * @memberof Subscription
 * @instance
 * @throws {Error} If the plan is 'free' or if Stripe subscription details are missing.
 * @returns {Promise<this>} The updated subscription instance.
 */
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

/**
 * Removes a seat from the subscription.
 * This method performs an optimistic update on the local database and offloads
 * the Stripe API call to a background worker via Google Cloud Pub/Sub.
 * @memberof Subscription
 * @instance
 * @throws {Error} If the plan is 'free', if trying to remove the last seat, or if Stripe details are missing.
 * @returns {Promise<this>} The updated subscription instance.
 */
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

/**
 * Gets the number of available seats for the subscription.
 * @memberof Subscription
 * @instance
 * @returns {number} The number of available (unoccupied) seats.
 */
SubscriptionSchema.methods.getAvailableSeats = function () {
  return Math.max(0, this.seats.total - this.seats.used);
};

/**
 * Calculates and returns the current seat cost details.
 * @memberof Subscription
 * @instance
 * @returns {{pricePerSeat: number, totalSeats: number, usedSeats: number, monthlyCost: number}} An object containing cost details.
 */
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

/**
 * Finds an active subscription by user ID.
 * @static
 * @param {mongoose.Schema.Types.ObjectId | string} userId - The ID of the user.
 * @returns {mongoose.Query} A Mongoose query object that resolves to the subscription document or null.
 */
SubscriptionSchema.statics.findByUser = function (userId) {
  // NOTE: .lean() is intentionally omitted here as the caller will likely
  // need a full Mongoose document to call instance methods like .incrementUsage().
  return this.findOne({ userId, status: 'active' });
};

/**
 * Finds an active subscription by tenant ID.
 * @static
 * @param {mongoose.Schema.Types.ObjectId | string} tenantId - The ID of the tenant.
 * @returns {mongoose.Query} A Mongoose query object that resolves to the subscription document or null.
 */
SubscriptionSchema.statics.findByTenant = function (tenantId) {
  // NOTE: .lean() is intentionally omitted here as the caller will likely
  // need a full Mongoose document to call instance methods like .addSeat().
  return this.findOne({ tenantId, status: 'active' });
};

/**
 * Finds all subscriptions with an 'active' status.
 * @static
 * @returns {mongoose.Query} A Mongoose query object that resolves to an array of active subscription documents.
 */
SubscriptionSchema.statics.findActiveSubscriptions = function () {
  // OPTIMIZATION: Use .lean() for read-only operations that fetch multiple documents.
  // This returns plain JavaScript objects instead of full Mongoose documents,
  // significantly improving performance and reducing memory usage for list-based queries.
  return this.find({ status: 'active' }).lean();
};

/**
 * Finds active subscriptions that are expiring within a specified number of days.
 * @static
 * @param {number} [daysFromNow=7] - The number of days from now to check for expiration.
 * @returns {mongoose.Query} A Mongoose query object that resolves to an array of expiring subscription documents.
 */
SubscriptionSchema.statics.findExpiring = function (daysFromNow = 7) {
  const now = new Date();
  const futureDate = new Date(
    now.getTime() + daysFromNow * 24 * 60 * 60 * 1000
  );

  // OPTIMIZATION: Use .lean() for read-only operations. This query is likely used for
  // background jobs like sending notifications, which don't require Mongoose document instances.
  // This improves query speed and reduces memory footprint.
  return this.find({
    status: 'active',
    'billingCycle.currentPeriodEnd': {
      $gte: now,
      $lte: futureDate,
    },
  }).lean();
};

/**
 * Finds active subscriptions whose daily usage counters have not been reset in the last 24 hours.
 * @static
 * @returns {mongoose.Query} A Mongoose query object that resolves to an array of subscription documents needing a usage reset.
 */
SubscriptionSchema.statics.findNeedingReset = function () {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // NOTE: .lean() is intentionally omitted. The caller (e.g., a cron job) will
  // need to iterate and call the .resetDailyUsage() instance method on each document,
  // which requires a full Mongoose instance.
  return this.find({
    status: 'active',
    'usage.lastResetAt': { $lt: yesterday },
  });
};

/**
 * @typedef {import('mongoose').Model<Subscription & import('mongoose').Document>} SubscriptionModelType
 */

/**
 * The Mongoose model for the Subscription schema.
 * @type {SubscriptionModelType}
 */
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

export default Subscription;