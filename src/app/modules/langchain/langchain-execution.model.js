import mongoose from 'mongoose';

const LangchainExecutionSchema = new mongoose.Schema(
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
    inputs: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    outputs: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    stepsExecution: [
      {
        stepName: {
          type: String,
          required: true
        },
        stepType: {
          type: String,
          required: true
        },
        input: mongoose.Schema.Types.Mixed,
        output: mongoose.Schema.Types.Mixed,
        durationMs: Number,
        status: {
          type: String,
          required: true,
          enum: ['success', 'failed']
        },
        error: String
      }
    ],
    status: {
      type: String,
      required: true,
      enum: ['running', 'success', 'failed'],
      default: 'running'
    },
    totalDurationMs: {
      type: Number,
      default: 0
    },
    gcsLogUri: {
      type: String,
      default: ''
    },
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true
  }
);

const LangchainExecution = mongoose.models.LangchainExecution || mongoose.model('LangchainExecution', LangchainExecutionSchema);

export default LangchainExecution;
