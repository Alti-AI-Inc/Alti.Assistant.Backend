import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * Tenant Invitation Model Schema
 * Manages invitations sent to users to join a tenant/workspace
 */
const TenantInvitationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      required: [true, 'Role is required'],
      default: 'member',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Inviter ID is required'],
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'pending_email', 'accepted', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    metadata: {
      inviterName: String,
      tenantName: String,
      message: String,
      ipAddress: String,
      userAgent: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performance
TenantInvitationSchema.index({ email: 1, tenantId: 1, status: 1 });
TenantInvitationSchema.index({ token: 1, status: 1 });
TenantInvitationSchema.index({ expiresAt: 1, status: 1 });

// TTL index to auto-delete expired invitations after 30 days
TenantInvitationSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 2592000, // 30 days
    partialFilterExpression: { status: 'expired' },
  }
);

// Static method to generate secure token
TenantInvitationSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString('hex');
};

// Static method to find pending invitations for an email
TenantInvitationSchema.statics.findPendingByEmail = function (email) {
  return this.find({
    email: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });
};

// Static method to find pending invitation by token
TenantInvitationSchema.statics.findByToken = async function (token) {
  return await this.findOne({
    token,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).populate('tenantId', 'name slug');
};

// Instance method to check if invitation is expired
TenantInvitationSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

// Instance method to mark as accepted
TenantInvitationSchema.methods.markAsAccepted = async function (userId) {
  this.status = 'accepted';
  this.acceptedAt = new Date();
  this.acceptedBy = userId;
  return await this.save();
};

// Instance method to cancel invitation
TenantInvitationSchema.methods.cancel = async function () {
  this.status = 'cancelled';
  return await this.save();
};

// Pre-save hook to mark as expired if past expiry date
TenantInvitationSchema.pre('save', function (next) {
  if (this.status === 'pending' && this.isExpired()) {
    this.status = 'expired';
  }
  next();
});

const TenantInvitation = mongoose.model(
  'TenantInvitation',
  TenantInvitationSchema
);

export default TenantInvitation;
