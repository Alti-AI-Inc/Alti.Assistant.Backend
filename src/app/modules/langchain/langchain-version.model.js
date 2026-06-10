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

const LangchainChainVersion = mongoose.models.LangchainChainVersion || mongoose.model('LangchainChainVersion', LangchainChainVersionSchema);

export default LangchainChainVersion;