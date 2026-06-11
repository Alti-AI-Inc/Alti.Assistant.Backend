import mongoose from 'mongoose';

/**
 * @description Represents the schema for a single execution of a Langchain chain.
 * This schema is designed for a multi-tenant environment, capturing detailed information
 * about the execution's inputs, outputs, steps, status, performance, and token usage.
 * It includes fields crucial for platform owner oversight, such as tenant isolation,
 * correlation IDs for tracing, and metadata for auditing. It also includes fields to
 * map executions to the organizational hierarchy (user, manager, admin) for usage
 * tracking and limit enforcement.
 * @property {String} tenantId - The identifier for the tenant (workspace) under which the execution occurred. Essential for data isolation and management in a multi-tenant system.
 * @property {mongoose.Schema.Types.ObjectId} chainId - A reference to the 'LangchainChain' document that was executed.
 * @property {String} userId - The identifier of the user who initiated the execution.
 * @property {String} [teamId] - The identifier for the team the user belonged to at the time of execution. Critical for attributing usage to managers.
 * @property {String} [managerId] - The identifier of the user's manager at the time of execution. Enables direct notifications and limit checks for managers.
 * @property {String} [correlationId] - An optional ID to link this execution with a broader workflow or request for end-to-end tracing.
 * @property {String} environment - The deployment environment (e.g., 'development', 'production') where the execution took place.
 * @property {mongoose.Schema.Types.Mixed} inputs - The initial input data provided to the chain. WARNING: Must be sanitized before use to prevent NoSQL injection.
 * @property {mongoose.Schema.Types.Mixed} outputs - The final output data produced by the chain.
 * @property {Array<Object>} stepsExecution - An ordered array detailing the execution of each step within the chain.
 * @property {String} stepsExecution.stepName - The name of the individual step.
 * @property {String} stepsExecution.stepType - The type of the step (e.g., 'llm', 'prompt', 'tool').
 * @property {mongoose.Schema.Types.Mixed} stepsExecution.input - The input data for the step.
 * @property {mongoose.Schema.Types.Mixed} stepsExecution.output - The output data from the step.
 * @property {Number} stepsExecution.durationMs - The execution duration of the step in milliseconds.
 * @property {String} stepsExecution.status - The completion status of the step ('success' or 'failed').
 * @property {String} [stepsExecution.error] - An error message if the step failed.
 * @property {String} status - The overall status of the chain execution ('running', 'success', 'failed').
 * @property {Number} totalDurationMs - The total time taken for the entire chain execution in milliseconds.
 * @property {String} [gcsLogUri] - An optional URI pointing to a detailed log file, typically stored in a cloud storage service like GCS.
 * @property {Object} tokenUsage - An object tracking the language model token consumption for the execution.
 * @property {Number} tokenUsage.promptTokens - The number of tokens in the input prompt.
 * @property {Number} tokenUsage.completionTokens - The number of tokens in the generated completion.
 * @property {Number} tokenUsage.totalTokens - The sum of prompt and completion tokens.
 * @property {Object} metadata - Contains metadata about the execution context, primarily for auditing and administrative oversight.
 * @property {String} metadata.triggeredBy - Indicates the source of the execution trigger ('user', 'platform_owner', 'system').
 * @property {Boolean} metadata.isLimitOverride - A flag indicating if a Platform Owner bypassed standard tenant limits for this execution.
 * @property {Date} createdAt - Timestamp of when the document was created.
 * @property {Date} updatedAt - Timestamp of when the document was last updated.
 */
const LangchainExecutionSchema = new mongoose.Schema(
  {
    // Platform Owner Oversight: tenantId is crucial for a multi-tenant architecture.
    // It represents the workspace boundary, enabling filtering and management on a per-tenant basis,
    // providing the foundation for global oversight and tenant-specific administration (by workspace owners/admins).
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
    // Hierarchy Integration: userId identifies the end-user. This, combined with teamId and managerId,
    // allows for correct propagation of usage data and enforcement of limits across the user -> manager -> admin hierarchy.
    userId: {
      type: String,
      required: true,
      index: true
    },
    // BUG FIX: Added teamId to bridge the hierarchy gap. Storing the teamId at the time of execution is critical for
    // correctly attributing costs and usage to the correct team and its manager, even if the user later changes teams.
    // This enables proper usage propagation and limit enforcement at the manager level.
    teamId: {
      type: String, // Can be mongoose.Schema.Types.ObjectId if teams are a separate collection
      index: true,
      default: null
    },
    // BUG FIX: Added managerId to provide a direct link for notifications and approvals.
    // This ensures usage is visible to the correct supervisor and supports manager-specific dashboards and controls.
    managerId: {
      type: String, // Can be mongoose.Schema.Types.ObjectId if users are a separate collection
      index: true,
      default: null
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
      // SECURITY: Storing arbitrary objects can be risky. Ensure any user-provided data within this object
      // is properly sanitized and validated before being used in database queries to prevent NoSQL injection attacks.
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
    // Global Statistics & Hierarchy Integration: Token usage is a key metric for the Platform Owner to monitor
    // platform-wide costs. It is also the primary data point that must be aggregated up the
    // user -> team -> workspace hierarchy for limit enforcement and reporting.
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

// Hierarchy Integration Optimization: This index is crucial for efficiently querying
// executions for a specific team within a tenant, enabling fast reporting for managers.
LangchainExecutionSchema.index({ tenantId: 1, teamId: 1, createdAt: -1 });

/**
 * @description Mongoose model for Langchain chain executions.
 * This model is used to create, read, update, and delete records of chain executions
 * in the MongoDB database.
 * @model LangchainExecution
 * @see LangchainExecutionSchema
 */
const LangchainExecution = mongoose.models.LangchainExecution || mongoose.model('LangchainExecution', LangchainExecutionSchema);

export default LangchainExecution;