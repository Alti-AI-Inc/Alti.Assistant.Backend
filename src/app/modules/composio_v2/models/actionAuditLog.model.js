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
 * @property {ActionAuditLogError} [error] - Details of any error that occurred during execution.
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
     * Details of any error that occurred during execution.
     * @type {ActionAuditLogError}
     */
    error: {
      message: String,
      code: String,
      stack: String,
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
 * Logs older than 90 days (configurable) will be automatically removed from the collection.
 * @index {createdAt: 1}
 * @options {expireAfterSeconds: 90 * 24 * 60 * 60}
 */
ActionAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
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