import mongoose from 'mongoose';

const LangchainChainVersionSchema = new mongoose.Schema(
  {
    chainId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LangchainChain',
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    versionNumber: {
      type: Number,
      required: true,
      index: true
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

// Compound index to ensure uniqueness per chain and version number
LangchainChainVersionSchema.index({ chainId: 1, versionNumber: 1 }, { unique: true });

const LangchainChainVersion = mongoose.models.LangchainChainVersion || mongoose.model('LangchainChainVersion', LangchainChainVersionSchema);

export default LangchainChainVersion;
