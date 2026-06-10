/**
 * @file This file defines the Mongoose schema and model for the User entity.
 * It includes user authentication details, subscription information, usage tracking,
 * and multi-tenancy fields.
 * @module User
 */

import crypto from 'crypto';
import emailValidator from 'email-validator';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'; // Security: Import bcrypt for password hashing.

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
 * @property {string} [confirmationToken] - Hashed token for email confirmation.
 * @property {Date} [confirmationTokenExpires] - Expiration date for the confirmation token.
 * @property {string} [resetPasswordOTP] - Hashed One-Time Password for password reset.
 * @property {Date} [resetPasswordExpires] - Expiration date for the password reset OTP.
 * @property {string} [deleteAccountOTP] - Hashed One-Time Password for account deletion.
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
    provider: { type: String, trim: true }, // Security: Trim whitespace from input.
    /**
     * The unique ID provided by the authentication provider.
     * @type {string}
     */
    providerId: { type: String, trim: true }, // Security: Trim whitespace from input.
    /**
     * URL to the user's avatar image.
     * @type {string}
     */
    avatar: {
      type: String,
      trim: true, // Security: Trim whitespace from input.
      validate: {
        // Security: Ensure URL uses a safe protocol (http/https) to prevent javascript: XSS attacks.
        validator: function (v) {
          return v == null || v === '' || /^(https?):\/\//.test(v);
        },
        message: (props) => `${props.value} is not a valid and secure URL!`,
      },
    },
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
      trim: true, // Security: Trim whitespace.
      lowercase: true, // Security: Store emails in a consistent, case-insensitive format.
      validate: {
        validator: emailValidator.validate,
        message: 'Please provide a valid email address',
      },
    },
    /**
     * The user's password (hashed). Not selected by default in queries.
     * @type {string}
     */
    password: {
      type: String,
      // required: [true, 'Please provide a password'], // Not required to support OAuth
      unique: false,
      select: false, // Security: Do not return password field in queries by default.
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
      plan_name: { type: String, trim: true }, // "personal", "business" // Security: Trim whitespace.
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
      invoiceUrl: {
        type: String,
        trim: true, // Security: Trim whitespace.
        validate: {
          // Security: Ensure URL uses a safe protocol (http/https) to prevent javascript: XSS attacks.
          validator: function (v) {
            return v == null || v === '' || /^(https?):\/\//.test(v);
          },
          message: (props) => `${props.value} is not a valid and secure URL!`,
        },
      },
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
    // Security: This field stores the HASH of the token, not the token itself.
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
    // Security: This field should store the HASH of the OTP, not the OTP itself.
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
    // Security: This field should store the HASH of the OTP, not the OTP itself.
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
    stripeAccountId: { type: String, trim: true }, // Security: Trim whitespace.

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
 * Security: Mongoose 'pre-save' hook to hash the password before saving it to the database.
 * This ensures that plaintext passwords are never stored.
 */
UserSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new) and is not empty
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    // Hash the password with a salt. 12 is a strong salt round value.
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Security: Instance method to compare a candidate password with the user's hashed password.
 * @param {string} candidatePassword - The password to compare.
 * @returns {Promise<boolean>} A promise that resolves to true if the passwords match, false otherwise.
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
  // Use bcrypt to safely compare the provided password with the stored hash.
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generates a random confirmation token, hashes it, and sets its expiration date.
 * The hashed token is stored on the user document.
 * @this {mongoose.Document<User>}
 * @returns {string} The unhashed confirmation token to be sent to the user.
 */
UserSchema.methods.generateConfirmationToken = function () {
  // Security: Generate a cryptographically secure random token.
  const token = crypto.randomBytes(32).toString('hex');

  // Security: Hash the token before storing it in the database to prevent token theft from a DB breach.
  // The user receives the raw token, and we compare it against this stored hash.
  this.confirmationToken = crypto.createHash('sha256').update(token).digest('hex');

  // Security: Set a reasonable expiration time for the token (24 hours).
  this.confirmationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Return the unhashed token to be sent to the user (e.g., via email).
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
  // Security: Validate that the ID is a valid MongoDB ObjectId format before querying.
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