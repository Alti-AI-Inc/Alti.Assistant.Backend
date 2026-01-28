import mongoose from 'mongoose';

/**
 * TenantMember Model Schema
 * Junction table for many-to-many relationship between Users and Tenants
 */
const TenantMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
      required: true,
      index: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'suspended'],
      default: 'active',
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    invitedAt: {
      type: Date,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index - a user can only have one membership per tenant
TenantMemberSchema.index({ userId: 1, tenantId: 1 }, { unique: true });

// Index for finding all tenants for a user
TenantMemberSchema.index({ userId: 1, status: 1 });

// Index for finding all members of a tenant
TenantMemberSchema.index({ tenantId: 1, status: 1 });

/**
 * Static method to check if user is member of tenant
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
 * Static method to get user's role in tenant
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
 * Static method to get all tenants for a user
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
 * Static method to get all members of a tenant
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
 * Update last accessed time
 */
TenantMemberSchema.methods.updateLastAccessed = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

const TenantMember = mongoose.model('TenantMember', TenantMemberSchema);

export default TenantMember;
