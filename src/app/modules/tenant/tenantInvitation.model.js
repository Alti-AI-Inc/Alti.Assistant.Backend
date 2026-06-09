import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * @typedef {object} TenantInvitationMetadata
 * @property {string} [inviterName] - The name of the user who sent the invitation.
 * @property {string} [tenantName] - The name of the tenant/workspace the user is invited to.
 * @property {string} [message] - An optional custom message included with the invitation.
 * @property {string} [ipAddress] - The IP address from which the invitation was sent.
 * @property {string} [userAgent] - The user agent string of the client that sent the invitation.
 */

/**
 * @typedef {object} TenantInvitationSchema
 * @property {mongoose.Types.ObjectId} tenantId - The ID of the tenant/workspace the user is invited to.
 * @property {string} email - The email address of the user being invited.
 * @property {'admin'|'manager'|'user'} role - The role the invited user will have in the tenant.
 * @property {mongoose.Types.ObjectId} invitedBy - The ID of the user who sent the invitation.
 * @property {string} token - A unique, secure token for the invitation.
 * @property {'pending'|'pending_email'|'accepted'|'expired'|'cancelled'} status - The current status of the invitation.
 * @property {Date} expiresAt - The date and time when the invitation token expires.
 * @property {Date} [acceptedAt] - The date and time when the invitation was accepted.
 * @property {mongoose.Types.ObjectId} [acceptedBy] - The ID of the user who accepted the invitation.
 * @property {TenantInvitationMetadata} [metadata] - Additional metadata related to the invitation.
 * @property {Date} createdAt - The date and time when the invitation was created.
 * @property {Date} updatedAt - The date and time when the invitation was last updated.
 */

/**
 * Mongoose Schema for Tenant Invitations.
 * Manages invitations sent to users to join a tenant/workspace.
 *
 * @type {mongoose.Schema<TenantInvitationSchema>}
 */
const TenantInvitationSchema = new mongoose.Schema(
  {
    /**
     * The ID of the tenant/workspace the user is invited to.
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
     * The email address of the user being invited.
     * @type {string}
     * @required
     * @lowercase
     * @trim
     * @index
     */
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * The role the invited user will have in the tenant.
     * @type {'admin'|'manager'|'user'}
     * @enum ['admin', 'manager', 'user']
     * @required
     * @default 'user'
     */
    role: {
      type: String,
      enum: ['admin', 'manager', 'user'],
      required: [true, 'Role is required'],
      default: 'user',
    },
    /**
     * The ID of the user who sent the invitation.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     */
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Inviter ID is required'],
    },
    /**
     * A unique, secure token for the invitation.
     * Used for accepting the invitation.
     * @type {string}
     * @required
     * @unique
     * @index
     */
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * The current status of the invitation.
     * - 'pending': Invitation sent, awaiting acceptance.
     * - 'pending_email': Invitation sent, email verification pending (if applicable).
     * - 'accepted': Invitation has been accepted by the user.
     * - 'expired': Invitation has passed its expiry date.
     * - 'cancelled': Invitation was explicitly cancelled by an admin or inviter.
     * @type {'pending'|'pending_email'|'accepted'|'expired'|'cancelled'}
     * @enum ['pending', 'pending_email', 'accepted', 'expired', 'cancelled']
     * @default 'pending'
     * @index
     */
    status: {
      type: String,
      enum: ['pending', 'pending_email', 'accepted', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    /**
     * The date and time when the invitation token expires.
     * @type {Date}
     * @required
     * @index
     */
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    /**
     * The date and time when the invitation was accepted.
     * @type {Date|null}
     * @default null
     */
    acceptedAt: {
      type: Date,
      default: null,
    },
    /**
     * The ID of the user who accepted the invitation.
     * @type {mongoose.Schema.Types.ObjectId|null}
     * @ref User
     * @default null
     */
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    /**
     * Additional metadata related to the invitation.
     * @type {TenantInvitationMetadata}
     */
    metadata: {
      inviterName: String,
      tenantName: String,
      message: String,
      ipAddress: String,
      userAgent: String,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

/**
 * Compound index for efficient lookup of invitations by email, tenant, and status.
 * @index
 */
TenantInvitationSchema.index({ email: 1, tenantId: 1, status: 1 });
/**
 * Compound index for efficient lookup of invitations by token and status.
 * @index
 */
TenantInvitationSchema.index({ token: 1, status: 1 });
/**
 * Compound index for efficient lookup of invitations by expiry date and status.
 * @index
 */
TenantInvitationSchema.index({ expiresAt: 1, status: 1 });

/**
 * TTL (Time-To-Live) index to automatically delete expired invitations.
 * Invitations with status 'expired' will be removed from the database 30 days after their `expiresAt` date.
 * This helps in cleaning up old, irrelevant data.
 * @index
 */
TenantInvitationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 2592000, // 30 days (30 * 24 * 60 * 60 seconds)
    partialFilterExpression: { status: 'expired' }, // Only apply TTL to documents with status 'expired'
  }
);

/**
 * Generates a secure, random hexadecimal token for an invitation.
 *
 * @static
 * @returns {string} A 64-character hexadecimal string.
 */
TenantInvitationSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Finds all pending invitations for a given email address that have not yet expired.
 * The email comparison is case-insensitive.
 *
 * @static
 * @param {string} email - The email address to search for.
 * @returns {mongoose.Query<Array<TenantInvitationSchema>>} A Mongoose query for pending invitations.
 */
TenantInvitationSchema.statics.findPendingByEmail = function (email) {
  return this.find({
    email: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() }, // Ensure the invitation has not expired
  });
};

/**
 * Finds a single pending invitation by its token, ensuring it has not expired.
 * Populates the `tenantId` field with selected tenant details.
 *
 * @static
 * @param {string} token - The unique invitation token.
 * @returns {Promise<TenantInvitationSchema|null>} The found invitation document, or null if not found or expired.
 */
TenantInvitationSchema.statics.findByToken = async function (token) {
  return await this.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: new Date() }, // Ensure the invitation has not expired
  }).populate('tenantId', 'name slug'); // Populate tenant name and slug
};

/**
 * Checks if the current invitation has expired based on its `expiresAt` date.
 *
 * @method
 * @returns {boolean} True if the invitation has expired, false otherwise.
 */
TenantInvitationSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

/**
 * Marks the invitation as 'accepted' and records the acceptance time and user.
 *
 * @method
 * @param {mongoose.Types.ObjectId} userId - The ID of the user who accepted the invitation.
 * @returns {Promise<TenantInvitationSchema>} The updated invitation document.
 */
TenantInvitationSchema.methods.markAsAccepted = async function (userId) {
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.acceptedBy = userId;
  return await this.save();
};

/**
 * Marks the invitation as 'cancelled'.
 *
 * @method
 * @returns {Promise<TenantInvitationSchema>} The updated invitation document.
 */
TenantInvitationSchema.methods.cancel = async function () {
  this.status = 'cancelled';
  return await this.save();
};

/**
 * Pre-save hook to automatically update the invitation status to 'expired'
 * if it's currently 'pending' and its `expiresAt` date has passed.
 *
 * @param {function} next - The next middleware function.
 */
TenantInvitationSchema.pre('save', function (next) {
  if (this.status === 'pending' && this.isExpired()) {
    this.status = 'expired';
  }
  next();
});

/**
 * Represents the Tenant Invitation model in MongoDB.
 * Provides methods for interacting with tenant invitation documents.
 *
 * @type {mongoose.Model<TenantInvitationSchema>}
 */
const TenantInvitation = mongoose.model(
  'TenantInvitation',
  TenantInvitationSchema
);

/**
 * @exports {mongoose.Model<TenantInvitationSchema>} TenantInvitation - The Mongoose model for tenant invitations.
 */
export default TenantInvitation;