/**
 * @file This file defines the Mongoose schema and model for the User entity.
 * It includes user authentication details, subscription information, usage tracking,
 * and multi-tenancy fields.
 * @module User
 */

import crypto from 'crypto';
import emailValidator from 'email-validator';
import mongoose from 'mongoose';

/**
 * @typedef {Object} SubscriptionDetails
 * @property {number} [price] - The price of the subscription plan.
 * @property {string} [plan_name] - The name of the subscription plan (e.g., "personal", "business").
 * @property {'month'|'year'} [duration] - The duration of the subscription.
 * @property {Date} [expiresAt] - The date when the subscription expires.
 * @property {'paid'|'expired'} [status] - The current status of the subscription.
 * @property {string} [invoiceUrl] - URL to the subscription invoice.
 */

/**
 * @typedef {Object} FreePlanUsage
 * @property {number} [promptsUsed=0] - Number of prompts used under the free plan.
 * @property {number} [imagesUsed=0] - Number of images generated under the free plan.
 * @property {Date} [lastResetAt] - Timestamp of the last reset for free plan usage.
 */

/**
 * @typedef {Object} DailyRequestLimit
 * @property {number} [requestsUsed=0] - Number of requests made today.
 * @property {number} [maxRequests=10] - Maximum allowed requests per day.
 * @property {Date} [lastResetAt] - Timestamp of the last reset for daily requests.
 */

/**
 * @typedef {Object} User
 * @property {string} [provider] - Authentication provider (e.g., 'google', 'github').
 * @property {string} [providerId] - ID from the authentication provider.
 * @property {string} [avatar] - URL to the user's avatar image.
 * @property {string} email - Unique email address of the user.
 * @property {string} [password] - Hashed password of the user (selected: false).
 * @property {boolean} [isSubscribed=false] - Indicates if the user has an active subscription.
 * @property {SubscriptionDetails} [subscription] - Details of the legacy subscription system.
 * @property {FreePlanUsage} [freePlanUsage] - Tracks usage for the free plan.
 * @property {DailyRequestLimit} [dailyRequestLimit] - Tracks daily request limits.
 * @property {'user'|'buyer'|'admin'|'super_admin'|'unauthorized'} [role='unauthorized'] - User's role within the application.
 * @property {mongoose.Types.ObjectId[]} [llamaAiSessions] - References to Llama AI chat history sessions.
 * @property {mongoose.Types.ObjectId[]} [browserSessions] - References to browser sessions.
 * @property {mongoose.Types.ObjectId[]} [notifications] - References to user notifications.
 * @property {string} [confirmationToken] - Token for email confirmation.
 * @property {Date} [confirmationTokenExpires] - Expiration date for the confirmation token.
 * @property {string} [resetPasswordOTP] - One-Time Password for password reset.
 * @property {Date} [resetPasswordExpires] - Expiration date for the password reset OTP.
 * @property {string} [deleteAccountOTP] - One-Time Password for account deletion.
 * @property {Date} [deleteAccountExpires] - Expiration date for the account deletion OTP.
 * @property {string} [stripeAccountId] - Stripe account ID for the user.
 * @property {mongoose.Types.ObjectId} [subscriptionId=null] - Reference to the new Subscription model.
 * @property {'free'|'explore'|'execute'|'command'} [currentPlan='free'] - The user's current subscription plan.
 * @property {mongoose.Types.ObjectId} [tenantId=null] - DEPRECATED: Reference to the Tenant model for multi-tenancy.
 * @property {'admin'|'manager'|'user'} [tenantRole=null] - DEPRECATED: User's role within a specific tenant.
 * @property {string[]} [tenantPermissions=[]] - DEPRECATED: Permissions within a specific tenant.
 * @property {mongoose.Types.ObjectId} [activeTenantId=null] - The currently active tenant for users belonging to multiple tenants.
 * @property {Date} createdAt - Timestamp when the user was created.
 * @property {Date} updatedAt - Timestamp when the user was last updated.
 */

/**
 * Mongoose schema for the User model.
 * Defines the structure and validation rules for user documents in the database.
 * @type {mongoose.Schema<User>}
 */
const UserSchema = new mongoose.Schema(
  {
    /**
     * The authentication provider used (e.g., 'google', 'github').
     * @type {string}
     */
    provider: { type: String },
    /**
     * The unique ID provided by the authentication provider.
     * @type {string}
     */
    providerId: { type: String },
    /**
     * URL to the user's avatar image.
     * @type {string}
     */
    avatar: { type: String },
    /**
     * The user's email address. Must be unique and valid.
     * @type {string}
     * @required
     * @unique
     */
    email: {
      type: String,
      required: [true, 'Please provide a unique email'],
      unique: true,
      validate: function () {
        return emailValidator.validate(this.email);
      },
    },
    /**
     * The user's password (hashed). Not selected by default in queries.
     * @type {string}
     */
    password: {
      type: String,
      // required: [true, 'Please provide a password'],
      unique: false,
      select: 0,
    },
    /**
     * Indicates if the user has an active subscription.
     * @type {boolean}
     * @default false
     */
    isSubscribed: {
      type: Boolean,
      default: false,
    },
    /**
     * Details about the user's subscription (legacy system).
     * @type {SubscriptionDetails}
     */
    subscription: {
      /**
       * The price of the subscription plan.
       * @type {number}
       */
      price: { type: Number }, // e.g., 150
      /**
       * The name of the subscription plan.
       * @type {string}
       */
      plan_name: { type: String }, // "personal", "business"
      /**
       * The duration of the subscription.
       * @type {'month'|'year'}
       */
      duration: { type: String, enum: ['month', 'year'] }, // "month" or "year"
      /**
       * The date when the subscription expires.
       * @type {Date}
       */
      expiresAt: { type: Date },
      /**
       * The status of the subscription.
       * @type {'paid'|'expired'}
       */
      status: { type: String, enum: ['paid', 'expired'] },
      /**
       * URL to the subscription invoice.
       * @type {string}
       */
      invoiceUrl: { type: String },
    },

    /**
     * Tracks usage for the free plan.
     * @type {FreePlanUsage}
     */
    freePlanUsage: {
      /**
       * Number of prompts used under the free plan.
       * @type {number}
       * @default 0
       */
      promptsUsed: { type: Number, default: 0 },
      /**
       * Number of images generated under the free plan.
       * @type {number}
       * @default 0
       */
      imagesUsed: { type: Number, default: 0 },
      /**
       * Timestamp of the last reset for free plan usage.
       * @type {Date}
       * @default Date.now
       */
      lastResetAt: { type: Date, default: Date.now }, // Track when the usage was last reset
    },
    /**
     * Tracks daily request limits for the user.
     * @type {DailyRequestLimit}
     */
    dailyRequestLimit: {
      /**
       * Number of requests made today.
       * @type {number}
       * @default 0
       */
      requestsUsed: { type: Number, default: 0 },
      /**
       * Maximum allowed requests per day.
       * @type {number}
       * @default 10
       */
      maxRequests: { type: Number, default: 10 }, // 10 requests per day limit
      /**
       * Timestamp of the last reset for daily requests.
       * @type {Date}
       * @default Date.now
       */
      lastResetAt: { type: Date, default: Date.now }, // Track when the daily limit was last reset
    },
    /**
     * The user's role within the application.
     * @type {'user'|'buyer'|'admin'|'super_admin'|'unauthorized'}
     * @default 'unauthorized'
     */
    role: {
      type: String,
      enum: {
        values: ['user', 'buyer', 'admin', 'super_admin', 'unauthorized'],
      },
      default: 'unauthorized',
    },
    /**
     * An array of ObjectIds referencing Llama AI chat history sessions.
     * @type {mongoose.Types.ObjectId[]}
     * @ref Chat-History
     */
    llamaAiSessions: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Chat-History' },
    ],
    /**
     * An array of ObjectIds referencing browser sessions.
     * @type {mongoose.Types.ObjectId[]}
     * @ref BrowserSession
     */
    browserSessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BrowserSession',
      },
    ],
    /**
     * An array of ObjectIds referencing user notifications.
     * @type {mongoose.Types.ObjectId[]}
     * @ref Notification
     */
    notifications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Notification', // Reference to Notification model
      },
    ],
    /**
     * Token used for email confirmation.
     * @type {string}
     */
    confirmationToken: String,
    /**
     * Expiration date for the email confirmation token.
     * @type {Date}
     */
    confirmationTokenExpires: Date,
    /**
     * One-Time Password (OTP) for resetting the user's password.
     * @type {string}
     */
    resetPasswordOTP: String,
    /**
     * Expiration date for the password reset OTP.
     * @type {Date}
     */
    resetPasswordExpires: Date,
    /**
     * One-Time Password (OTP) for deleting the user's account.
     * @type {string}
     */
    deleteAccountOTP: String,
    /**
     * Expiration date for the account deletion OTP.
     * @type {Date}
     */
    deleteAccountExpires: Date,
    /**
     * The user's Stripe account ID.
     * @type {string}
     */
    stripeAccountId: { type: String },

    /**
     * Reference to the new Subscription model.
     * @type {mongoose.Types.ObjectId}
     * @ref Subscription
     * @default null
     */
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true,
    },
    /**
     * The user's current subscription plan.
     * @type {'free'|'explore'|'execute'|'command'}
     * @default 'free'
     */
    currentPlan: {
      type: String,
      enum: ['free', 'explore', 'execute', 'command'],
      default: 'free',
      index: true,
    },

    /**
     * DEPRECATED: Reference to the Tenant model for multi-tenant support.
     * Use TenantMember collection for multi-tenant support.
     * @type {mongoose.Types.ObjectId}
     * @ref Tenant
     * @default null
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
      // DEPRECATED: Use TenantMember collection for multi-tenant support
      // Kept for backward compatibility
    },
    /**
     * DEPRECATED: User's role within a specific tenant.
     * Use TenantMember collection for role management.
     * @type {'admin'|'manager'|'user'}
     * @default null
     */
    tenantRole: {
      type: String,
      enum: ['admin', 'manager', 'user'],
      default: null,
      // DEPRECATED: Use TenantMember collection for role management
    },
    /**
     * DEPRECATED: Permissions within a specific tenant.
     * Use TenantMember collection for permissions.
     * @type {string[]}
     * @default []
     */
    tenantPermissions: {
      type: [String],
      default: [],
      // DEPRECATED: Use TenantMember collection for permissions
    },
    /**
     * The currently active tenant for users who belong to multiple tenants.
     * @type {mongoose.Types.ObjectId}
     * @ref Tenant
     * @default null
     */
    activeTenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
      // Current working tenant for users with multiple tenants
    },
  },
  {
    /**
     * Mongoose timestamps option. Adds `createdAt` and `updatedAt` fields.
     * @type {boolean}
     */
    timestamps: true,
  }
);

/**
 * Generates a random confirmation token and sets its expiration date.
 * The token is stored on the user document.
 * @this {mongoose.Document<User>}
 * @returns {string} The generated confirmation token.
 */
UserSchema.methods.generateConfirmationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');

  this.confirmationToken = token;

  const date = new Date();

  date.setDate(date.getDate() + 1);
  this.confirmationTokenExpires = date;

  return token;
};

/**
 * Checks if a user with the given ID exists in the database.
 * @static
 * @param {string|mongoose.Types.ObjectId} id - The user ID to check.
 * @returns {Promise<boolean>} A promise that resolves to true if the user exists, false otherwise.
 * @this {mongoose.Model<User>}
 */
UserSchema.statics.isUserExist = async function (id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return false;

  const user = await this.findById(id).select('_id').lean();
  return !!user;
};

/**
 * Mongoose model for the User schema.
 * Provides an interface for interacting with the 'users' collection in MongoDB.
 * @type {mongoose.Model<User>}
 */
const UserModel = mongoose.model('User', UserSchema);

export default UserModel;