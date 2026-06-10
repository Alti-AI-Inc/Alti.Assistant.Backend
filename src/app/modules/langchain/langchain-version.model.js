import mongoose from 'mongoose';

const LangchainChainVersionSchema = new mongoose.Schema(
  {
    chainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LangchainChain',
      required: true
      // Removed redundant single index 'index: true' because chainId is the prefix of the compound unique index below.
    },
    // BUG FIX: Changed userId from String to a proper ObjectId reference.
    // INTEGRATION FIX: This is critical for role validation and hierarchical integrity.
    // It allows populating user details (role, manager, etc.) to enforce permissions,
    // check limits, and propagate notifications without separate, inefficient lookups.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Assumes a 'User' model exists for referencing.
      required: true,
      index: true
    },
    // BUG FIX: Changed tenantId from String to a proper ObjectId reference.
    // INTEGRATION FIX: This enforces strict tenant boundaries at the database level
    // and is essential for aggregating usage data for workspace admins.
    // A null value correctly represents a global/system-level version accessible by super_admins.
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant', // Assumes a 'Tenant' or 'Workspace' model exists for referencing.
      index: true,
      default: null
    },
    versionNumber: {
      type: Number,
      required: true
    },
    inputVariables: {
      type: [String],
      default: []
    },
    outputVariables: {
      type: [String],
      default: []
    },
    steps: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    changeSummary: {
      type: String,
      default: 'Version snapshot captured.'
    },
    // Platform Owner / Super Admin controls for global oversight and tenant management
    isSystemTemplate: {
      type: Boolean,
      default: false,
      index: true // Allows Platform Owners to publish global read-only templates across all tenants
    },
    bypassLimits: {
      type: Boolean,
      default: false // Allows Platform Owners to override tenant-specific version/storage limits
    },
    isLocked: {
      type: Boolean,
      default: false // Platform Owners can lock specific versions to prevent deletion/modification by tenant users
    }
  },
  {
    timestamps: true
  }
);

// Compound index to ensure uniqueness per chain and version number.
// This also serves as an efficient index for queries filtering by chainId alone.
LangchainChainVersionSchema.index({ chainId: 1, versionNumber: 1 }, { unique: true });

// Compound index to optimize queries fetching a user's versions sorted by creation date (e.g., history timelines)
LangchainChainVersionSchema.index({ userId: 1, createdAt: -1 });

// Compound index for tenant-based global oversight, statistics, and compliance auditing
LangchainChainVersionSchema.index({ tenantId: 1, createdAt: -1 });

const LangchainChainVersion = mongoose.models.LangchainChainVersion || mongoose.model('LangchainChainVersion', LangchainChainVersionSchema);

export default LangchainChainVersion;