/**
 * @file This file defines the Mongoose schema and model for the User entity.
 * It includes user authentication details, usage tracking, and a robust multi-workspace
 * (multi-tenant) structure for team management.
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
 * @typedef {Object} WorkspaceMember
 * @property {mongoose.Types.ObjectId} workspaceId - Reference to the Tenant/Workspace model.
 * @property {'admin'|'manager'|'member'} role - The user's role within that specific workspace.
 */

/**
 * @typedef {Object} User
 * @property {string} [provider] - Authentication provider (e.g., 'google', 'github').
 * @property {string} [providerId] - ID from the authentication provider.
 * @property {string} [avatar] - URL to the user's avatar image.
 * @property {string} email - Unique email address of the user.
 * @property {string} [password] - Hashed password of the user (selected: false).
 * @property {boolean} [isSubscribed=false] - DEPRECATED: Indicates if the user has an active subscription.
 * @property {SubscriptionDetails} [subscription] - DEPRECATED: Details of the legacy subscription system.
 * @property {FreePlanUsage} [freePlanUsage] - Tracks usage for the free plan (for users not in a workspace).
 * @property {DailyRequestLimit} [dailyRequestLimit] - Tracks daily request limits.
 * @property {'user'|'buyer'|'admin'|'super_admin'|'unauthorized'} [role='unauthorized'] - User's global role within the application.
 * @property {mongoose.Types.ObjectId[]} [llamaAiSessions] - References to Llama AI chat history sessions.
 * @property {mongoose.Types.ObjectId[]} [browserSessions] - References to browser sessions.
 * @property {mongoose.Types.ObjectId[]} [notifications] - References to user notifications.
 * @property {string} [confirmationToken] - Hashed token for email confirmation.
 * @property {Date} [confirmationTokenExpires] - Expiration date for the confirmation token.
 * @property {string} [resetPasswordOTP] - Hashed One-Time Password for password reset.
 * @property {Date} [resetPasswordExpires] - Expiration date for the password reset OTP.
 * @property {string} [deleteAccountOTP] - Hashed One-Time Password for account deletion.
 * @property {Date} [deleteAccountExpires] - Expiration date for the account deletion OTP.
 * @property {string} [stripeAccountId] - Stripe account ID for the user (typically the workspace admin/owner).
 * @property {WorkspaceMember[]} [workspaces=[]] - A list of workspaces the user is a member of.
 * @property {mongoose.Types.ObjectId} [activeWorkspaceId=null] - The currently active workspace for the user.
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
     * DEPRECATED: Indicates if the user has an active subscription.
     * Subscription status is now managed at the workspace (Tenant) level.
     * @type {boolean}
     * @default false
     */
    isSubscribed: {
      type: Boolean,
      default: false,
    },
    /**
     * DEPRECATED: Details about the user's subscription (legacy system).
     * Subscriptions are now managed at the workspace (Tenant) level.
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
     * Tracks usage for the free plan, applicable to users not part of a paid workspace.
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
     * The user's global role within the application, distinct from their role within a workspace.
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
    confirmationToken: { type: String, index: true, sparse: true }, // Performance: Sparse index for fast token lookups, as this field is usually null.
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
    resetPasswordOTP: { type: String, index: true, sparse: true }, // Performance: Sparse index for fast OTP lookups, as this field is usually null.
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
    deleteAccountOTP: { type: String, index: true, sparse: true }, // Performance: Sparse index for fast OTP lookups, as this field is usually null.
    /**
     * Expiration date for the account deletion OTP.
     * @type {Date}
     */
    deleteAccountExpires: Date,
    /**
     * The user's Stripe account ID. Typically used by workspace admins/owners for billing.
     * @type {string}
     */
    stripeAccountId: { type: String, trim: true, index: true, sparse: true }, // Performance: Sparse index for fast webhook lookups, as not all users have a stripe account.

    /**
     * An array of workspaces the user is a member of, including their role in each.
     * This is the primary mechanism for multi-tenancy and team management.
     * @type {WorkspaceMember[]}
     */
    workspaces: {
      type: [
        new mongoose.Schema(
          {
            workspaceId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Tenant', // Note: 'Tenant' is used for consistency with existing refs.
              required: true,
            },
            role: {
              type: String,
              enum: ['admin', 'manager', 'member'], // Defines roles within a workspace.
              required: true,
            },
          },
          { _id: false }
        ), // Optimization: _id is not needed for subdocuments in this array.
      ],
      default: [],
    },

    /**
     * The ID of the currently active workspace for a user who belongs to multiple workspaces.
     * This determines the context for their actions and data visibility.
     * @type {mongoose.Types.ObjectId}
     * @ref Tenant
     * @default null
     */
    activeWorkspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant', // Note: 'Tenant' is used for consistency with existing refs.
      default: null,
      index: true,
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

// Performance: Add a compound index for OAuth providers to speed up login.
// A sparse index is used because these fields are only present for OAuth users.
UserSchema.index({ provider: 1, providerId: 1 }, { sparse: true });

// Performance: Index the workspaces array for faster lookups of users within a specific workspace.
UserSchema.index({ 'workspaces.workspaceId': 1 });

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
  this.confirmationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

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

  // Performance: .select('_id') and .lean() make this a highly efficient existence check.
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