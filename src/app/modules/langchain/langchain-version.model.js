import mongoose from 'mongoose';

const LangchainChainVersionSchema = new mongoose.Schema(
  {
    chainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LangchainChain',
      required: true
      // Removed redundant single index 'index: true' because chainId is the prefix of the compound unique index below.
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    tenantId: {
      type: String,
      index: true,
      default: null // Supports multi-tenancy partitioning and global/system-level versions
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