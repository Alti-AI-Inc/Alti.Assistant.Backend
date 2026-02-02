import mongoose from 'mongoose';

/**
 * Tenant Model Schema
 * Represents a workspace/organization that contains multiple users
 */
const TenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
      minlength: [2, 'Tenant name must be at least 2 characters'],
      maxlength: [100, 'Tenant name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Tenant must have an owner'],
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'trial', 'cancelled'],
      default: 'trial',
      index: true,
    },
    plan: {
      type: String,
      enum: ['free', 'explore', 'analyze', 'execute', 'command', 'enterprise'],
      default: 'free',
      index: true,
    },
    settings: {
      allowMemberInvites: {
        type: Boolean,
        default: true,
      },
      requireApproval: {
        type: Boolean,
        default: false,
      },
      maxMembers: {
        type: Number,
        default: 5,
      },
      customBranding: {
        logo: String,
        primaryColor: String,
      },
    },
    limits: {
      maxApiCalls: {
        type: Number,
        default: 1000,
      },
      maxStorage: {
        type: Number,
        default: 5368709120, // 5GB in bytes
      },
      maxUsers: {
        type: Number,
        default: 5,
      },
    },
    usage: {
      apiCallsUsed: {
        type: Number,
        default: 0,
      },
      storageUsed: {
        type: Number,
        default: 0,
      },
      usersCount: {
        type: Number,
        default: 1,
      },
      lastResetAt: {
        type: Date,
        default: Date.now,
      },
    },
    // Reference to Subscription model (single source of truth for billing)
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
      index: true,
    },
    metadata: {
      industry: String,
      companySize: String,
      useCase: String,
      referralSource: String,
      customFields: mongoose.Schema.Types.Mixed,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
TenantSchema.index({ ownerId: 1, status: 1 });
TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ status: 1, plan: 1 });
TenantSchema.index({ createdAt: -1 });

// Virtual for member count
TenantSchema.virtual('members', {
  ref: 'User',
  localField: '_id',
  foreignField: 'tenantId',
});

// Virtual for subscription (populate from Subscription model)
TenantSchema.virtual('subscription', {
  ref: 'Subscription',
  localField: 'subscriptionId',
  foreignField: '_id',
  justOne: true,
});

// Enable virtuals in JSON output
TenantSchema.set('toJSON', { virtuals: true });
TenantSchema.set('toObject', { virtuals: true });

// Static method to find active tenants
TenantSchema.statics.findActive = function () {
  return this.find({ status: 'active', deletedAt: null });
};

// Static method to find tenant with subscription populated
TenantSchema.statics.findWithSubscription = function (tenantId) {
  return this.findById(tenantId).populate('subscriptionId');
};

// Instance method to check if tenant can add more members
TenantSchema.methods.canAddMembers = function () {
  return this.usage.usersCount < this.limits.maxUsers;
};

// Instance method to check if tenant has reached API limit
TenantSchema.methods.hasReachedApiLimit = function () {
  return this.usage.apiCallsUsed >= this.limits.maxApiCalls;
};

// Instance method to increment usage
TenantSchema.methods.incrementUsage = async function (type, amount = 1) {
  const updateField = `usage.${type}`;
  this[updateField] = (this[updateField] || 0) + amount;
  return await this.save();
};

// Soft delete
TenantSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  this.status = 'cancelled';
  return await this.save();
};

const Tenant = mongoose.model('Tenant', TenantSchema);

export default Tenant;
