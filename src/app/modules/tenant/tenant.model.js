import mongoose from 'mongoose';

/**
 * @typedef {object} TenantSettings
 * @property {boolean} [allowMemberInvites=true] - Indicates if members are allowed to invite other users.
 * @property {boolean} [requireApproval=false] - Indicates if new member invitations require owner approval.
 * @property {number} [maxMembers=5] - Maximum number of members allowed in the tenant.
 * @property {object} [customBranding] - Custom branding settings for the tenant.
 * @property {string} [customBranding.logo] - URL or path to the custom logo.
 * @property {string} [customBranding.primaryColor] - Primary color for custom branding (e.g., hex code).
 */

/**
 * @typedef {object} TenantLimits
 * @property {number} [maxApiCalls=1000] - Maximum number of API calls allowed for the tenant per billing cycle.
 * @property {number} [maxStorage=5368709120] - Maximum storage allowed for the tenant in bytes (default 5GB).
 * @property {number} [maxUsers=5] - Maximum number of users allowed for the tenant.
 */

/**
 * @typedef {object} TenantUsage
 * @property {number} [apiCallsUsed=0] - Number of API calls used by the tenant in the current billing cycle.
 * @property {number} [storageUsed=0] - Amount of storage used by the tenant in bytes.
 * @property {number} [usersCount=1] - Current number of active users in the tenant.
 * @property {Date} [lastResetAt] - Timestamp of the last usage reset.
 */

/**
 * @typedef {object} TenantMetadata
 * @property {string} [industry] - Industry the tenant operates in.
 * @property {string} [companySize] - Size of the company (e.g., "1-10", "11-50").
 * @property {string} [useCase] - Primary use case for the platform.
 * @property {string} [referralSource] - How the tenant heard about the platform.
 * @property {mongoose.Schema.Types.Mixed} [customFields] - Any additional custom metadata fields.
 */

/**
 * @typedef {object} TenantDocument
 * @property {string} name - The name of the tenant (e.g., "Acme Corp").
 * @property {string} slug - A URL-friendly, unique identifier for the tenant.
 * @property {string} subdomain - A unique subdomain for the tenant's dedicated instance.
 * @property {mongoose.Types.ObjectId} ownerId - The ID of the user who owns this tenant.
 * @property {'active'|'suspended'|'trial'|'cancelled'} [status='trial'] - The current operational status of the tenant.
 * @property {'free'|'explore'|'analyze'|'execute'|'command'|'enterprise'} [plan='free'] - The subscription plan level for the tenant.
 * @property {TenantSettings} [settings] - Configuration settings specific to the tenant.
 * @property {TenantLimits} [limits] - Resource limits imposed on the tenant based on their plan.
 * @property {TenantUsage} [usage] - Current resource usage statistics for the tenant.
 * @property {mongoose.Types.ObjectId} [subscriptionId=null] - Reference to the associated Subscription model for billing.
 * @property {TenantMetadata} [metadata] - Additional descriptive information about the tenant.
 * @property {Date} [deletedAt=null] - Timestamp when the tenant was soft-deleted.
 * @property {Date} createdAt - The timestamp when the tenant was created.
 * @property {Date} updatedAt - The timestamp when the tenant was last updated.
 * @property {Array<UserDocument>} members - Virtual field: Populated list of users belonging to this tenant.
 * @property {SubscriptionDocument} subscription - Virtual field: Populated subscription details for this tenant.
 */

/**
 * Tenant Model Schema
 * Represents a workspace/organization that contains multiple users.
 *
 * @class Tenant
 * @augments {mongoose.Model<TenantDocument>}
 */
const TenantSchema = new mongoose.Schema(
  {
    /**
     * The name of the tenant (e.g., "Acme Corp").
     * @member {string} TenantDocument.name
     * @required
     * @minlength 2
     * @maxlength 100
     */
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
      minlength: [2, 'Tenant name must be at least 2 characters'],
      maxlength: [100, 'Tenant name cannot exceed 100 characters'],
    },
    /**
     * A URL-friendly, unique identifier for the tenant.
     * @member {string} TenantDocument.slug
     * @required
     * @unique
     * @lowercase
     * @index
     */
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * A unique subdomain for the tenant's dedicated instance.
     * @member {string} TenantDocument.subdomain
     * @required
     * @unique
     * @lowercase
     * @index
     * @match /^[a-z0-9-]+$/
     */
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^[a-z0-9-]+$/,
        'Subdomain can only contain lowercase letters, numbers, and hyphens',
      ],
    },
    /**
     * The ID of the user who owns this tenant.
     * @member {mongoose.Types.ObjectId} TenantDocument.ownerId
     * @required
     * @ref User
     * @index
     */
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tenant must have an owner'],
      index: true,
    },
    /**
     * The current operational status of the tenant.
     * @member {'active'|'suspended'|'trial'|'cancelled'} TenantDocument.status
     * @default 'trial'
     * @index
     */
    status: {
      type: String,
      enum: ['active', 'suspended', 'trial', 'cancelled'],
      default: 'trial',
      index: true,
    },
    /**
     * The subscription plan level for the tenant.
     * @member {'free'|'explore'|'analyze'|'execute'|'command'|'enterprise'} TenantDocument.plan
     * @default 'free'
     * @index
     */
    plan: {
      type: String,
      enum: ['free', 'explore', 'analyze', 'execute', 'command', 'enterprise'],
      default: 'free',
      index: true,
    },
    /**
     * Configuration settings specific to the tenant.
     * @member {TenantSettings} TenantDocument.settings
     */
    settings: {
      /**
       * Indicates if members are allowed to invite other users.
       * @member {boolean} TenantDocument.settings.allowMemberInvites
       * @default true
       */
      allowMemberInvites: {
        type: Boolean,
        default: true,
      },
      /**
       * Indicates if new member invitations require owner approval.
       * @member {boolean} TenantDocument.settings.requireApproval
       * @default false
       */
      requireApproval: {
        type: Boolean,
        default: false,
      },
      /**
       * Maximum number of members allowed in the tenant.
       * @member {number} TenantDocument.settings.maxMembers
       * @default 5
       */
      maxMembers: {
        type: Number,
        default: 5,
      },
      /**
       * Custom branding settings for the tenant.
       * @member {object} TenantDocument.settings.customBranding
       */
      customBranding: {
        /**
         * URL or path to the custom logo.
         * @member {string} TenantDocument.settings.customBranding.logo
         */
        logo: String,
        /**
         * Primary color for custom branding (e.g., hex code).
         * @member {string} TenantDocument.settings.customBranding.primaryColor
         */
        primaryColor: String,
      },
    },
    /**
     * Resource limits imposed on the tenant based on their plan.
     * @member {TenantLimits} TenantDocument.limits
     */
    limits: {
      /**
       * Maximum number of API calls allowed for the tenant per billing cycle.
       * @member {number} TenantDocument.limits.maxApiCalls
       * @default 1000
       */
      maxApiCalls: {
        type: Number,
        default: 1000,
      },
      /**
       * Maximum storage allowed for the tenant in bytes (default 5GB).
       * @member {number} TenantDocument.limits.maxStorage
       * @default 5368709120
       */
      maxStorage: {
        type: Number,
        default: 5368709120, // 5GB in bytes
      },
      /**
       * Maximum number of users allowed for the tenant.
       * @member {number} TenantDocument.limits.maxUsers
       * @default 5
       */
      maxUsers: {
        type: Number,
        default: 5,
      },
    },
    /**
     * Current resource usage statistics for the tenant.
     * @member {TenantUsage} TenantDocument.usage
     */
    usage: {
      /**
       * Number of API calls used by the tenant in the current billing cycle.
       * @member {number} TenantDocument.usage.apiCallsUsed
       * @default 0
       */
      apiCallsUsed: {
        type: Number,
        default: 0,
      },
      /**
       * Amount of storage used by the tenant in bytes.
       * @member {number} TenantDocument.usage.storageUsed
       * @default 0
       */
      storageUsed: {
        type: Number,
        default: 0,
      },
      /**
       * Current number of active users in the tenant.
       * @member {number} TenantDocument.usage.usersCount
       * @default 1
       */
      usersCount: {
        type: Number,
        default: 1,
      },
      /**
       * Timestamp of the last usage reset.
       * @member {Date} TenantDocument.usage.lastResetAt
       * @default Date.now
       */
      lastResetAt: {
        type: Date,
        // Bug fix: Date.now as a default needs to be a function to be evaluated at document creation time.
        default: () => Date.now(),
      },
    },
    /**
     * Reference to the associated Subscription model for billing.
     * @member {mongoose.Types.ObjectId} TenantDocument.subscriptionId
     * @ref Subscription
     * @default null
     * @index
     */
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true,
    },
    /**
     * Additional descriptive information about the tenant.
     * @member {TenantMetadata} TenantDocument.metadata
     */
    metadata: {
      /**
       * Industry the tenant operates in.
       * @member {string} TenantDocument.metadata.industry
       */
      industry: String,
      /**
       * Size of the company (e.g., "1-10", "11-50").
       * @member {string} TenantDocument.metadata.companySize
       */
      companySize: String,
      /**
       * Primary use case for the platform.
       * @member {string} TenantDocument.metadata.useCase
       */
      useCase: String,
      /**
       * How the tenant heard about the platform.
       * @member {string} TenantDocument.metadata.referralSource
       */
      referralSource: String,
      /**
       * Any additional custom metadata fields.
       * @member {mongoose.Schema.Types.Mixed} TenantDocument.metadata.customFields
       */
      customFields: mongoose.Schema.Types.Mixed,
    },
    /**
     * Timestamp when the tenant was soft-deleted.
     * @member {Date} TenantDocument.deletedAt
     * @default null
     */
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

/**
 * Indexes for performance.
 * @memberof TenantSchema
 */
TenantSchema.index({ ownerId: 1, status: 1 });
TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ status: 1, plan: 1 });
TenantSchema.index({ createdAt: -1 });

/**
 * Virtual field to get all members (users) associated with this tenant.
 * Populates from the 'User' model where `tenantId` matches the tenant's `_id`.
 * @virtual
 * @member {Array<UserDocument>} TenantDocument.members
 * @ref User
 * @localField _id
 * @foreignField tenantId
 */
TenantSchema.virtual('members', {
  ref: 'User',
  localField: '_id',
  foreignField: 'tenantId',
});

/**
 * Virtual field to get the subscription details associated with this tenant.
 * Populates from the 'Subscription' model where `_id` matches the tenant's `subscriptionId`.
 * @virtual
 * @member {SubscriptionDocument} TenantDocument.subscription
 * @ref Subscription
 * @localField subscriptionId
 * @foreignField _id
 * @justOne true
 */
TenantSchema.virtual('subscription', {
  ref: 'Subscription',
  localField: 'subscriptionId',
  foreignField: '_id',
  justOne: true,
});

/**
 * Enable virtuals in JSON output.
 * @memberof TenantSchema
 */
TenantSchema.set('toJSON', { virtuals: true });
/**
 * Enable virtuals in Object output.
 * @memberof TenantSchema
 */
TenantSchema.set('toObject', { virtuals: true });

/**
 * Static method to find all active tenants that have not been soft-deleted.
 * @static
 * @returns {mongoose.Query<Array<TenantDocument>, TenantDocument>} A Mongoose query for active tenants.
 */
TenantSchema.statics.findActive = function () {
  return this.find({ status: 'active', deletedAt: null });
};

/**
 * Static method to find a tenant by ID and populate its associated subscription details.
 * @static
 * @param {mongoose.Types.ObjectId | string} tenantId - The ID of the tenant to find.
 * @returns {mongoose.Query<TenantDocument | null, TenantDocument>} A Mongoose query for the tenant with populated subscription.
 */
TenantSchema.statics.findWithSubscription = function (tenantId) {
  // Bug fix: Populate the 'subscription' virtual field, not the 'subscriptionId' field itself.
  return this.findById(tenantId).populate('subscription');
};

/**
 * Instance method to check if the tenant can add more members based on their limits.
 * @method
 * @returns {boolean} True if the tenant can add more members, false otherwise.
 */
TenantSchema.methods.canAddMembers = function () {
  return this.usage.usersCount < this.limits.maxUsers;
};

/**
 * Instance method to check if the tenant has reached its API call limit.
 * @method
 * @returns {boolean} True if the tenant has reached or exceeded the API limit, false otherwise.
 */
TenantSchema.methods.hasReachedApiLimit = function () {
  return this.usage.apiCallsUsed >= this.limits.maxApiCalls;
};

/**
 * Instance method to increment a specific usage metric for the tenant.
 * @method
 * @param {'apiCallsUsed' | 'storageUsed' | 'usersCount'} type - The usage field to increment.
 * @param {number} [amount=1] - The amount to increment the usage by.
 * @returns {Promise<TenantDocument>} The updated tenant document.
 */
TenantSchema.methods.incrementUsage = async function (type, amount = 1) {
  const updateField = `usage.${type}`;
  this[updateField] = (this[updateField] || 0) + amount;
  return await this.save();
};

/**
 * Instance method to soft-delete the tenant by setting `deletedAt` and changing `status` to 'cancelled'.
 * @method
 * @returns {Promise<TenantDocument>} The updated tenant document.
 */
TenantSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  this.status = 'cancelled';
  return await this.save();
};

/**
 * Mongoose model for a Tenant.
 * @type {mongoose.Model<TenantDocument, {}, TenantMethods, TenantStatics>}
 */
const Tenant = mongoose.model('Tenant', TenantSchema);

export default Tenant;