import mongoose from 'mongoose';

const agentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    avatar: {
      type: String,
      default: '🤖',
    },
    instructions: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      enum: ['gpt-oss-120b', 'gpt-oss-20b'],
      default: 'gpt-oss-120b',
    },
    tools: [
      {
        type: String,
      },
    ],
    knowledgeBases: [
      {
        type: String,
      },
    ],
    triggers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trigger',
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'archived'],
      default: 'draft',
    },
    swarmConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      maxClones: {
        type: Number,
        default: 5,
      },
      strategy: {
        type: String,
        enum: ['parallel', 'sequential', 'race'],
        default: 'parallel',
      },
    },
    humanApproval: {
      required: {
        type: Boolean,
        default: false,
      },
      approvers: [
        {
          type: String,
        },
      ],
      channel: {
        type: String,
        enum: ['email', 'webhook', 'in-app'],
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamId: {
      type: String,
    },
    version: {
      type: Number,
      default: 1,
    },
    metadata: {
      totalRuns: {
        type: Number,
        default: 0,
      },
      successRate: {
        type: Number,
        default: 0,
      },
      avgLatencyMs: {
        type: Number,
        default: 0,
      },
      lastRunAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

agentSchema.index({ createdBy: 1, status: 1 });
agentSchema.index({ teamId: 1 });

const Agent = mongoose.model('Agent', agentSchema);

export default Agent;
