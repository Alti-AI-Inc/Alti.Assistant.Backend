import mongoose from 'mongoose';

/**
 * @typedef {Object} TenantMember
 * @property {mongoose.Types.ObjectId} userId - The ID of the user associated with this membership.
 * @property {mongoose.Types.ObjectId} tenantId - The ID of the tenant associated with this membership.
 * @property {'admin'|'manager'|'user'} role - The role of the user within the tenant.
 * @property {string[]} permissions - An array of specific permissions granted to the user within the tenant.
 * @property {'active'|'invited'|'suspended'} status - The current status of the user's membership in the tenant.
 * @property {mongoose.Types.ObjectId} [invitedBy] - The ID of the user who invited this member, if applicable.
 * @property {Date} [invitedAt] - The timestamp when the user was invited to the tenant.
 * @property {Date} joinedAt - The timestamp when the user officially joined the tenant.
 * @property {Date} lastAccessedAt - The timestamp of the user's last activity or access within the tenant.
 * @property {Date} createdAt - The timestamp when the membership record was created.
 * @property {Date} updatedAt - The timestamp when the membership record was last updated.
 */

/**
 * @typedef {mongoose.Document & TenantMember} TenantMemberDocument
 */

/**
 * Mongoose Schema for the TenantMember model.
 *
 * Represents a junction table for the many-to-many relationship between Users and Tenants.
 * It defines the specific role, permissions, and status of a user within a particular tenant.
 *
 * @class TenantMemberSchema
 */
const TenantMemberSchema = new mongoose.Schema(
  {
    /**
     * The unique identifier of the user.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     * @index
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    /**
     * The unique identifier of the tenant.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Tenant
     * @required
     * @index
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    /**
     * The role of the user within the tenant.
     * @type {'admin'|'manager'|'user'}
     * @enum ['admin', 'manager', 'user']
     * @default 'user'
     * @required
     * @index
     */
    role: {
      type: String,
      enum: ['admin', 'manager', 'user'],
      default: 'user',
      required: true,
      index: true,
    },
    /**
     * An array of specific permissions granted to the user within the tenant.
     * @type {string[]}
     * @default []
     */
    permissions: {
      type: [String],
      default: [],
    },
    /**
     * The current status of the user's membership in the tenant.
     * @type {'active'|'invited'|'suspended'}
     * @enum ['active', 'invited', 'suspended']
     * @default 'active'
     * @index
     */
    status: {
      type: String,
      enum: ['active', 'invited', 'suspended'],
      default: 'active',
      index: true,
    },
    /**
     * The unique identifier of the user who invited this member, if applicable.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     */
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    /**
     * The timestamp when the user was invited to the tenant.
     * @type {Date}
     */
    invitedAt: {
      type: Date,
    },
    /**
     * The timestamp when the user officially joined the tenant.
     * @type {Date}
     * @default Date.now
     */
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    /**
     * The timestamp of the user's last activity or access within the tenant.
     * @type {Date}
     * @default Date.now
     */
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Compound unique index to ensure a user can only have one membership per tenant.
 * Prevents duplicate user-tenant relationships.
 * @index
 */
TenantMemberSchema.index({ userId: 1, tenantId: 1 }, { unique: true });

/**
 * Index for efficiently finding all tenants a specific user is a member of, filtered by status.
 * @index
 */
TenantMemberSchema.index({ userId: 1, status: 1 });

/**
 * Index for efficiently finding all members of a specific tenant, filtered by status.
 * @index
 */
TenantMemberSchema.index({ tenantId: 1, status: 1 });

/**
 * Static method to check if a user is an active member of a specific tenant.
 *
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @returns {Promise<boolean>} - True if the user is an active member of the tenant, false otherwise.
 */
TenantMemberSchema.statics.isMember = async function (userId, tenantId) {
  const membership = await this.findOne({
    userId,
    tenantId,
    status: 'active',
  });
  return !!membership;
};

/**
 * Static method to retrieve a user's role and permissions within a specific tenant.
 *
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @param {mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @returns {Promise<{role: string, permissions: string[]}|null>} - An object containing the role and permissions if the user is an active member, otherwise null.
 */
TenantMemberSchema.statics.getUserRole = async function (userId, tenantId) {
  const membership = await this.findOne({
    userId,
    tenantId,
    status: 'active',
  }).select('role permissions');

  return membership;
};

/**
 * Static method to get all active tenants for a given user.
 * Populates tenant details and sorts by last accessed time.
 *
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @returns {Promise<Array<TenantMemberDocument>>} - A promise that resolves to an array of tenant membership objects,
 *   populated with selected tenant details (name, slug, subdomain, plan, status).
 */
TenantMemberSchema.statics.getUserTenants = async function (userId) {
  return this.find({
    userId,
    status: 'active',
  })
    .populate('tenantId', 'name slug subdomain plan status')
    .sort({ lastAccessedAt: -1 });
};

/**
 * Static method to get all members (active or invited) of a specific tenant.
 * Populates user and inviter details.
 *
 * @param {mongoose.Types.ObjectId} tenantId - The ID of the tenant.
 * @returns {Promise<Array<TenantMemberDocument>>} - A promise that resolves to an array of tenant membership objects,
 *   populated with selected user details (email, firstName, lastName, avatar) and inviter details.
 */
TenantMemberSchema.statics.getTenantMembers = async function (tenantId) {
  return this.find({
    tenantId,
    status: { $in: ['active', 'invited'] },
  })
    .populate('userId', 'email firstName lastName avatar')
    .populate('invitedBy', 'email firstName lastName')
    .sort({ createdAt: -1 });
};

/**
 * Instance method to update the `lastAccessedAt` timestamp for the current membership.
 *
 * @this TenantMemberDocument
 * @returns {Promise<TenantMemberDocument>} - A promise that resolves to the updated TenantMember document.
 */
TenantMemberSchema.methods.updateLastAccessed = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

/**
 * TenantMember Mongoose Model.
 * Provides an interface to the database for managing tenant memberships.
 *
 * @type {mongoose.Model<TenantMemberDocument>}
 */
const TenantMember = mongoose.model('TenantMember', TenantMemberSchema);

export default TenantMember;