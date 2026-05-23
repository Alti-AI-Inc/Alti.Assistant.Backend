import mongoose from 'mongoose';

const LangchainChainSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    userId: {
      type: String,
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
    steps: [
      {
        name: {
          type: String,
          required: true
        },
        type: {
          type: String,
          required: true,
          enum: ['prompt', 'llm', 'parser', 'retriever', 'tool', 'branch']
        },
        config: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ],
    isActive: {
      type: Boolean,
      default: true
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

// Compound index for user and chain name lookup
LangchainChainSchema.index({ userId: 1, name: 1 }, { unique: true });

const LangchainChain = mongoose.models.LangchainChain || mongoose.model('LangchainChain', LangchainChainSchema);

export default LangchainChain;
