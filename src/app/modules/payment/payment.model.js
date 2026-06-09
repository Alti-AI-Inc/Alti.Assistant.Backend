import mongoose from 'mongoose';

/**
 * DEPRECATED: This model has been merged into subscription.model.js
 * All subscription logic now uses src/app/modules/subscription/subscription.model.js
 *
 * This file is kept temporarily for reference during migration.
 * After all existing subscriptions are migrated, this file can be deleted.
 *
 * Migration path:
 * 1. Use subscription.model.js for all new subscriptions
 * 2. Run migration script to move existing data
 * 3. Update all imports to use new model
 * 4. Delete this file
 */

/**
 * @typedef {object} SubscriptionLimits
 * @property {number} [dailyRequestLimit=10] - The daily limit for requests allowed for the subscription.
 * @property {'none'|'basic_text'|'advanced_multimodal'|'premium_agentic'} [ragType='none'] - The type of RAG (Retrieval Augmented Generation) capabilities included in the subscription.
 * @property {number} [storagePerUser=0] - The amount of storage allocated per user in bytes.
 * @property {boolean} [canInviteTeam=false] - Indicates whether the user can invite team members under this subscription.
 */

/**
 * @typedef {object} SubscriptionSchemaObject
 * @property {mongoose.Types.ObjectId} userId - The ID of the user associated with this subscription.
 * @property {string} [transactionId] - The ID of the payment transaction.
 * @property {number} price - The price of the subscription.
 * @property {'free'|'explore'|'execute'|'command'} [plan_name] - The name of the subscription plan.
 * @property {string} [productId] - The ID of the product associated with this subscription.
 * @property {'month'|'year'} [duration] - The duration of the subscription period.
 * @property {Date} [expiresAt] - The date and time when the subscription expires.
 * @property {'paid'|'canceled'|'expired'|'pending'} paymentStatus - The current status of the payment for the subscription.
 * @property {string} [invoiceUrl=null] - The URL to the invoice for this subscription.
 * @property {SubscriptionLimits} limits - Features and limits associated with the subscription plan.
 * @property {mongoose.Types.ObjectId} [tenantId=null] - The ID of the tenant associated with this subscription, if applicable.
 * @property {string} [stripeSubscriptionId] - The ID of the subscription in Stripe. Unique and sparse.
 * @property {string} [stripeCustomerId] - The ID of the customer in Stripe.
 * @property {string} [stripePriceId] - The ID of the price object in Stripe.
 * @property {Date} [currentPeriodStart] - The start date of the current billing period.
 * @property {Date} [currentPeriodEnd] - The end date of the current billing period.
 * @property {Date} [cancelAt] - The date at which the subscription will be canceled.
 * @property {Date} [canceledAt] - The date when the subscription was actually canceled.
 * @property {Date} createdAt - The date when the subscription was created.
 * @property {Date} updatedAt - The date when the subscription was last updated.
 */

/**
 * Mongoose Schema for a user subscription.
 * This schema defines the structure for storing subscription details, including user association,
 * payment information, plan features, and Stripe-specific details.
 *
 * @type {mongoose.Schema<SubscriptionSchemaObject>}
 */
const SubscriptionSchema = new mongoose.Schema(
  {
    /**
     * The ID of the user associated with this subscription.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required true
     * @index true
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // BUG FIX: Added index for better query performance on userId, as it's a common lookup field.
    },
    /**
     * The ID of the payment transaction.
     * @type {string}
     * @required false
     */
    transactionId: { type: String, required: false },
    /**
     * The price of the subscription.
     * @type {number}
     * @required true
     */
    price: { 
      type: Number, // BUG FIX: Changed type from String to Number for monetary values to prevent type-related bugs and enable proper arithmetic operations.
      required: true 
    },
    /**
     * The name of the subscription plan.
     * @type {string}
     * @required false
     * @enum ['free', 'explore', 'execute', 'command']
     */
    plan_name: {
      type: String,
      required: false,
      enum: ['free', 'explore', 'execute', 'command'],
    },
    /**
     * The ID of the product associated with this subscription.
     * @type {string}
     * @required false
     */
    productId: { type: String, required: false },
    /**
     * The duration of the subscription period.
     * @type {string}
     * @required false
     * @enum ['month', 'year']
     */
    duration: { type: String, required: false, enum: ['month', 'year'] },
    /**
     * The date and time when the subscription expires.
     * @type {Date}
     * @required false
     */
    expiresAt: { type: Date, required: false },
    /**
     * The current status of the payment for the subscription.
     * @type {string}
     * @enum ['paid', 'canceled', 'expired', 'pending']
     */
    paymentStatus: {
      type: String,
      enum: ['paid', 'canceled', 'expired', 'pending'],
    },
    /**
     * The URL to the invoice for this subscription.
     * @type {string}
     * @default null
     */
    invoiceUrl: { type: String, default: null },

    /**
     * Plan Features (copied from Product at subscription time).
     * @type {SubscriptionLimits}
     */
    limits: {
      /**
       * The daily limit for requests allowed for the subscription.
       * @type {number}
       * @default 10
       */
      dailyRequestLimit: { type: Number, default: 10 },
      /**
       * The type of RAG (Retrieval Augmented Generation) capabilities included in the subscription.
       * @type {string}
       * @default 'none'
       * @enum ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic']
       */
      ragType: {
        type: String,
        default: 'none',
        enum: ['none', 'basic_text', 'advanced_multimodal', 'premium_agentic'],
      },
      /**
       * The amount of storage allocated per user in bytes.
       * @type {number}
       * @default 0
       */
      storagePerUser: { type: Number, default: 0 }, // in bytes
      /**
       * Indicates whether the user can invite team members under this subscription.
       * @type {boolean}
       * @default false
       */
      canInviteTeam: { type: Boolean, default: false },
    },

    /**
     * Multi-tenant support. The ID of the tenant associated with this subscription.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Tenant
     * @default null
     * @index true
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },

    /**
     * Stripe subscription details.
     * @type {string}
     * @unique true
     * @sparse true
     */
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    /**
     * The ID of the customer in Stripe.
     * @type {string}
     */
    stripeCustomerId: { type: String },
    /**
     * The ID of the price object in Stripe.
     * @type {string}
     */
    stripePriceId: { type: String },

    /**
     * Billing cycle start date.
     * @type {Date}
     */
    currentPeriodStart: { type: Date },
    /**
     * Billing cycle end date.
     * @type {Date}
     */
    currentPeriodEnd: { type: Date },
    /**
     * The date at which the subscription will be canceled.
     * @type {Date}
     */
    cancelAt: { type: Date },
    /**
     * The date when the subscription was actually canceled.
     * @type {Date}
     */
    canceledAt: { type: Date },
  },
  { timestamps: true }
);

/**
 * DEPRECATED: Mongoose Model for the Legacy Subscription.
 * This model is deprecated and is being replaced by `src/app/modules/subscription/subscription.model.js`.
 * It is kept temporarily for migration purposes. New code should use the `Subscription` model from the new file.
 *
 * @typedef {mongoose.Model<SubscriptionSchemaObject>} LegacySubscriptionModel
 * @global
 */
const SubscriptionModel = mongoose.model(
  'LegacySubscription',
  SubscriptionSchema
);

export default SubscriptionModel;