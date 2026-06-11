import mongoose from 'mongoose';

const LangchainExecutionSchema = new mongoose.Schema(
  {
    // Platform Owner Oversight: tenantId is crucial for a multi-tenant architecture.
    // It enables filtering, aggregation, and management of resources on a per-tenant basis,
    // providing the foundation for global oversight and tenant-specific administration.
    tenantId: {
      type: String, // Can be mongoose.Schema.Types.ObjectId if tenants are a separate collection
      required: true,
      index: true
    },
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
    // Platform Owner Oversight: A correlation ID links this specific execution to a broader
    // request or workflow, enabling end-to-end tracing for debugging and auditing across the platform.
    correlationId: {
      type: String,
      index: true
    },
    // Platform Owner Oversight: Environment tag helps filter logs and analyze behavior
    // across different deployment environments (e.g., development, staging, production).
    environment: {
      type: String,
      enum: ['development', 'staging', 'production', 'unknown'],
      default: 'unknown',
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
      default: 'running',
      index: true // Indexed for efficient querying of failed or in-progress executions.
    },
    totalDurationMs: {
      type: Number,
      default: 0
    },
    gcsLogUri: {
      type: String,
      default: ''
    },
    // Global Statistics: Token usage is a key metric for the Platform Owner to monitor
    // platform-wide costs, generate billing reports, and enforce tenant-specific limits.
    tokenUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 }
    },
    // Platform Owner Auditing: This field stores metadata about the execution context,
    // crucial for tracking administrative actions and limit overrides.
    metadata: {
      // Identifies if the execution was triggered by a regular user, an automated system, or a Platform Owner.
      triggeredBy: {
        type: String,
        enum: ['user', 'platform_owner', 'system'],
        default: 'user'
      },
      // Explicitly flags executions where a Platform Owner bypassed standard tenant limits.
      isLimitOverride: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true
  }
);

// Platform Owner Optimization: Compound indexes are critical for performant queries
// on large, multi-tenant datasets. This index optimizes for fetching a tenant's recent executions.
LangchainExecutionSchema.index({ tenantId: 1, createdAt: -1 });

// Platform Owner Optimization: This index improves performance when querying for all
// executions by a specific user within a given tenant.
LangchainExecutionSchema.index({ tenantId: 1, userId: 1 });

const LangchainExecution = mongoose.models.LangchainExecution || mongoose.model('LangchainExecution', LangchainExecutionSchema);

export default LangchainExecution;