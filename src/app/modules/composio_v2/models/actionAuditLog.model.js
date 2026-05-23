import mongoose from 'mongoose';

/**
 * Action Audit Log Model
 * 
 * Persistent audit trail for every Composio tool execution.
 * Captures the full lifecycle: what was requested, what was executed,
 * what the result was, and who did it.
 * 
 * Used for:
 *   - Compliance: provable record of all automated actions
 *   - Debugging: trace failed executions back to root cause
 *   - Analytics: understand action patterns and failure rates
 *   - Billing: track resource consumption per user
 */

const ActionAuditLogSchema = new mongoose.Schema(
  {
    // Identity
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      index: true,
    },
    executionId: {
      type: String,
      index: true,
    },

    // Action details
    app: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    toolName: {
      type: String,
    },
    toolSlug: {
      type: String,
    },

    // Input/Output
    parameters: {
      type: Object,
      default: {},
    },
    result: {
      type: Object,
      default: null,
    },
    error: {
      message: String,
      code: String,
      stack: String,
    },

    // Execution metadata
    status: {
      type: String,
      enum: ['pending', 'executing', 'success', 'failed', 'retried', 'rolled_back'],
      default: 'pending',
      index: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    attempts: {
      type: Number,
      default: 1,
    },
    retried: {
      type: Boolean,
      default: false,
    },

    // Classification context
    workflowType: {
      type: String,
      enum: ['single_step', 'multi_step', 'scheduled', 'manual'],
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    classifiedBy: {
      type: String,
      enum: ['ai_classification', 'langgraph_agent', 'manual_execution', 'schedule'],
      default: 'ai_classification',
    },

    // Step context (for multi-step workflows)
    stepIndex: {
      type: Number,
    },
    totalSteps: {
      type: Number,
    },
    stepId: {
      type: String,
    },

    // Redaction flag for sensitive data
    redacted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
ActionAuditLogSchema.index({ userId: 1, createdAt: -1 });
ActionAuditLogSchema.index({ app: 1, action: 1, createdAt: -1 });
ActionAuditLogSchema.index({ userId: 1, app: 1, status: 1 });
ActionAuditLogSchema.index({ executionId: 1, stepIndex: 1 });

// TTL index: auto-delete logs older than 90 days (configurable)
ActionAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

const ActionAuditLog =
  mongoose.models.ActionAuditLog ||
  mongoose.model('ActionAuditLog', ActionAuditLogSchema);

export default ActionAuditLog;
