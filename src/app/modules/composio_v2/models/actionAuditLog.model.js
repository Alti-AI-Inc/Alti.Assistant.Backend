import mongoose from 'mongoose';

// Security Patch: Helper function to sanitize string inputs by escaping HTML characters.
// This helps prevent Stored Cross-Site Scripting (XSS) vulnerabilities if this data
// is ever displayed in a web interface without proper frontend escaping.
const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string' || !unsafe) return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

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

/**
 * @typedef {Object} ActionAuditLogError
 * @property {string} [message] - The error message.
 * @property {string} [code] - An optional error code.
 * @property {string} [stack] - The stack trace of the error.
 */

/**
 * @typedef {Object} ActionAuditLogDocument
 * @property {mongoose.Types.ObjectId} userId - The ID of the user who initiated the action.
 * @property {string} [conversationId] - The ID of the conversation context in which the action occurred.
 * @property {string} [executionId] - A unique identifier for a specific execution instance, useful for tracing multi-step workflows.
 * @property {string} app - The name of the application/integration the tool belongs to (e.g., 'Slack', 'Jira').
 * @property {string} action - The specific action performed (e.g., 'sendMessage', 'createIssue').
 * @property {string} [toolName] - The human-readable name of the tool used.
 * @property {string} [toolSlug] - The machine-readable slug of the tool used.
 * @property {Object} [parameters] - The input parameters provided to the tool action. Defaults to an empty object.
 * @property {Object|null} [result] - The output or result returned by the tool action. Null if no result or action failed.
 * @property {ActionAuditLogError|null} [error] - Details of any error that occurred during execution. Null if no error.
 * @property {'pending'|'executing'|'success'|'failed'|'retried'|'rolled_back'} status - The current status of the action execution.
 * @property {number} [durationMs] - The duration of the action execution in milliseconds. Defaults to 0.
 * @property {number} [attempts] - The number of attempts made to execute the action. Defaults to 1.
 * @property {boolean} [retried] - Indicates if the action was retried. Defaults to false.
 * @property {'single_step'|'multi_step'|'scheduled'|'manual'} [workflowType] - The type of workflow this action is part of.
 * @property {number} [confidence] - A confidence score (0-1) related to the AI's decision to execute this action.
 * @property {'ai_classification'|'langgraph_agent'|'manual_execution'|'schedule'} [classifiedBy] - The entity or mechanism that classified/triggered this action. Defaults to 'ai_classification'.
 * @property {number} [stepIndex] - The index of the current step in a multi-step workflow.
 * @property {number} [totalSteps] - The total number of steps in the multi-step workflow.
 * @property {string} [stepId] - A unique identifier for the specific step within a workflow.
 * @property {boolean} [redacted] - Flag indicating if sensitive data in parameters/results has been redacted. Defaults to false.
 * @property {Date} createdAt - The timestamp when the log entry was created.
 * @property {Date} updatedAt - The timestamp when the log entry was last updated.
 */

/**
 * Mongoose Schema for the Action Audit Log.
 * Defines the structure and validation rules for storing audit trails of Composio tool executions.
 *
 * @type {mongoose.Schema<ActionAuditLogDocument>}
 */
const ActionAuditLogSchema = new mongoose.Schema(
  {
    // Identity
    /**
     * The ID of the user who initiated the action.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     * @index
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /**
     * The ID of the conversation context in which the action occurred.
     * @type {string}
     * @index
     */
    conversationId: {
      type: String,
      index: true,
    },
    /**
     * A unique identifier for a specific execution instance, useful for tracing multi-step workflows.
     * @type {string}
     * @index
     */
    executionId: {
      type: String,
      index: true,
    },

    // Action details
    /**
     * The name of the application/integration the tool belongs to (e.g., 'Slack', 'Jira').
     * @type {string}
     * @required
     * @index
     */
    app: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * The specific action performed (e.g., 'sendMessage', 'createIssue').
     * @type {string}
     * @required
     */
    action: {
      type: String,
      required: true,
    },
    /**
     * The human-readable name of the tool used.
     * @type {string}
     */
    toolName: {
      type: String,
    },
    /**
     * The machine-readable slug of the tool used.
     * @type {string}
     */
    toolSlug: {
      type: String,
    },

    // Input/Output
    /**
     * The input parameters provided to the tool action.
     * @type {Object}
     * @default {}
     */
    parameters: {
      type: Object,
      default: {},
    },
    /**
     * The output or result returned by the tool action. Null if no result or action failed.
     * @type {Object|null}
     * @default null
     */
    result: {
      type: Object,
      default: null,
    },
    /**
     * Details of any error that occurred during execution. Null if no error.
     * Defined as a sub-schema to allow for `default: null` and prevent an empty object `{}`
     * from being stored when no error is present, aligning with `result` field's behavior.
     * @type {ActionAuditLogError|null}
     * @default null
     */
    error: {
      type: new mongoose.Schema({
        message: String,
        code: String,
        stack: String,
      }, { _id: false }), // _id: false prevents Mongoose from adding an _id to the subdocument
      default: null, // Explicitly default to null if no error is provided
    },

    // Execution metadata
    /**
     * The current status of the action execution.
     * @type {'pending'|'executing'|'success'|'failed'|'retried'|'rolled_back'}
     * @enum {string}
     * @default 'pending'
     * @index
     */
    status: {
      type: String,
      enum: ['pending', 'executing', 'success', 'failed', 'retried', 'rolled_back'],
      default: 'pending',
      index: true,
    },
    /**
     * The duration of the action execution in milliseconds.
     * @type {number}
     * @default 0
     */
    durationMs: {
      type: Number,
      default: 0,
    },
    /**
     * The number of attempts made to execute the action.
     * @type {number}
     * @default 1
     */
    attempts: {
      type: Number,
      default: 1,
    },
    /**
     * Indicates if the action was retried.
     * @type {boolean}
     * @default false
     */
    retried: {
      type: Boolean,
      default: false,
    },

    // Classification context
    /**
     * The type of workflow this action is part of.
     * @type {'single_step'|'multi_step'|'scheduled'|'manual'}
     * @enum {string}
     */
    workflowType: {
      type: String,
      enum: ['single_step', 'multi_step', 'scheduled', 'manual'],
    },
    /**
     * A confidence score (0-1) related to the AI's decision to execute this action.
     * @type {number}
     * @min 0
     * @max 1
     */
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    /**
     * The entity or mechanism that classified/triggered this action.
     * @type {'ai_classification'|'langgraph_agent'|'manual_execution'|'schedule'}
     * @enum {string}
     * @default 'ai_classification'
     */
    classifiedBy: {
      type: String,
      enum: ['ai_classification', 'langgraph_agent', 'manual_execution', 'schedule'],
      default: 'ai_classification',
    },

    // Step context (for multi-step workflows)
    /**
     * The index of the current step in a multi-step workflow.
     * @type {number}
     */
    stepIndex: {
      type: Number,
    },
    /**
     * The total number of steps in the multi-step workflow.
     * @type {number}
     */
    totalSteps: {
      type: Number,
    },
    /**
     * A unique identifier for the specific step within a workflow.
     * @type {string}
     */
    stepId: {
      type: String,
    },

    // Redaction flag for sensitive data
    /**
     * Flag indicating if sensitive data in parameters/results has been redacted.
     * @type {boolean}
     * @default false
     */
    redacted: {
      type: Boolean,
      default: false,
    },
  },
  {
    /**
     * Mongoose timestamps option.
     * Automatically adds `createdAt` and `updatedAt` fields to the document.
     * @type {boolean}
     */
    timestamps: true,
  }
);

// Security Patch: Mongoose middleware to sanitize string fields before saving.
// This provides a layer of defense against Stored XSS by escaping HTML entities.
ActionAuditLogSchema.pre('save', function(next) {
  // List of top-level string fields to sanitize.
  const fieldsToSanitize = [
    'conversationId', 'executionId', 'app', 'action',
    'toolName', 'toolSlug', 'stepId'
  ];

  for (const field of fieldsToSanitize) {
    // Using this.get() to access the value is safer as it bypasses Mongoose's internal getters if any.
    const value = this.get(field);
    if (value && typeof value === 'string') {
      this.set(field, escapeHtml(value));
    }
  }

  // Sanitize fields within the nested 'error' object.
  if (this.error) {
    if (this.error.message) {
      this.error.message = escapeHtml(this.error.message);
    }
    if (this.error.code) {
      this.error.code = escapeHtml(this.error.code);
    }
    if (this.error.stack) {
      // Note: Escaping the stack trace can make it harder to read for debugging,
      // but it's safer if displayed directly in an HTML context.
      this.error.stack = escapeHtml(this.error.stack);
    }
  }

  // Note: The 'parameters' and 'result' fields are of type Object and are not sanitized here.
  // They are intended to store structured JSON data. Sanitizing them could corrupt the data's integrity.
  // The 'redacted' flag should be used to handle sensitive information within these objects,
  // and any consumer (e.g., a frontend application) is responsible for safely rendering their contents.

  next();
});

/**
 * Compound index for querying audit logs by user and creation time (descending).
 * @index {userId: 1, createdAt: -1}
 */
ActionAuditLogSchema.index({ userId: 1, createdAt: -1 });
/**
 * Compound index for querying audit logs by application, action, and creation time (descending).
 * @index {app: 1, action: 1, createdAt: -1}
 */
ActionAuditLogSchema.index({ app: 1, action: 1, createdAt: -1 });
/**
 * Compound index for querying audit logs by user, application, and status.
 * @index {userId: 1, app: 1, status: 1}
 */
ActionAuditLogSchema.index({ userId: 1, app: 1, status: 1 });
/**
 * Compound index for querying specific steps within an execution.
 * @index {executionId: 1, stepIndex: 1}
 */
ActionAuditLogSchema.index({ executionId: 1, stepIndex: 1 });

/**
 * TTL (Time-To-Live) index for automatic deletion of old audit logs.
 * Logs older than a configurable number of days will be automatically removed.
 * @index {createdAt: 1}
 */
// Security Patch: Use an environment variable for the TTL configuration instead of a hardcoded value.
// This allows for flexibility across different environments (dev, staging, prod) without code changes.
const AUDIT_LOG_TTL_DAYS = parseInt(process.env.AUDIT_LOG_TTL_DAYS, 10) || 90;
ActionAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: AUDIT_LOG_TTL_DAYS * 24 * 60 * 60 }
);

/**
 * Mongoose Model for Action Audit Logs.
 * Provides an interface to the `actionauditlogs` collection in MongoDB.
 *
 * @type {mongoose.Model<ActionAuditLogDocument>}
 * @exports ActionAuditLog
 */
const ActionAuditLog =
  mongoose.models.ActionAuditLog ||
  mongoose.model('ActionAuditLog', ActionAuditLogSchema);

export default ActionAuditLog;