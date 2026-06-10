import mongoose from 'mongoose';

/**
 * @typedef {object} WorkflowExecutionError
 * @property {string} [message] - The error message.
 * @property {string} [stack] - The stack trace of the error.
 * @property {string} [code] - An optional error code.
 */

/**
 * @typedef {object} WorkflowExecutionStep
 * @property {string} stepId - The unique identifier for the step within the workflow definition.
 * @property {'pending'|'running'|'completed'|'failed'|'skipped'} status - The current status of the step execution.
 * @property {Date} [startTime] - The timestamp when the step execution began.
 * @property {Date} [endTime] - The timestamp when the step execution finished.
 * @property {number} [duration] - The duration of the step execution in milliseconds.
 * @property {object} [result] - The output or result of the step's execution.
 * @property {WorkflowExecutionError} [error] - Details of any error that occurred during the step's execution.
 * @property {number} retryCount - The number of times this step has been retried.
 */

/**
 * Represents a single step within a workflow execution. This is a sub-document
 * of the main WorkflowExecution schema.
 * @type {mongoose.Schema<WorkflowExecutionStep>}
 */
const WorkflowExecutionStepSchema = new mongoose.Schema({
  stepId: String,
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
    default: 'pending',
  },
  startTime: Date,
  endTime: Date,
  duration: Number, // in milliseconds
  result: Object,
  error: {
    message: String,
    stack: String,
    code: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
});

/**
 * @typedef {object} WorkflowExecutionLog
 * @property {Date} timestamp - The timestamp of the log entry.
 * @property {'info'|'warn'|'error'|'debug'} level - The severity level of the log.
 * @property {string} message - The log message.
 * @property {string} [stepId] - The ID of the step that generated the log, if applicable.
 * @property {object} [data] - Additional structured data associated with the log entry.
 */

/**
 * @typedef {object} WorkflowExecutionResult
 * @property {boolean} success - Indicates if the workflow completed successfully.
 * @property {object} [data] - The final output or data from the workflow execution.
 * @property {string} [summary] - A summary of the execution result.
 */

/**
 * @typedef {object} WorkflowExecutionTopLevelError
 * @property {string} [message] - The error message.
 * @property {string} [stack] - The stack trace of the error.
 * @property {string} [stepId] - The ID of the step where the fatal error occurred.
 */

/**
 * Represents the Mongoose schema for a single execution of a workflow.
 * It tracks the overall status, timing, steps, logs, and results of a workflow run.
 *
 * @property {mongoose.Schema.Types.ObjectId} workflowId - Reference to the parent Workflow document.
 * @property {mongoose.Schema.Types.ObjectId} userId - Reference to the User who initiated or owns this execution. This is crucial for multi-tenancy and permissions.
 * @property {string} executionId - A unique identifier for this specific workflow run.
 * @property {'pending'|'running'|'completed'|'failed'|'cancelled'|'paused'|'awaiting_approval'} status - The overall status of the workflow execution.
 * @property {number} currentStepIndex - The index of the step that is currently running or was last run.
 * @property {'schedule'|'manual'|'webhook'|'event'} triggerType - The mechanism that initiated this workflow execution.
 * @property {Date} [startTime] - The timestamp when the execution began.
 * @property {Date} [endTime] - The timestamp when the execution finished.
 * @property {number} [duration] - The total duration of the execution in milliseconds.
 * @property {Array<WorkflowExecutionStep>} steps - An array of objects tracking the state of each individual step in the workflow.
 * @property {number} [totalSteps] - The total number of steps in the workflow at the time of execution.
 * @property {number} [completedSteps] - A counter for the number of successfully completed steps.
 * @property {number} [failedSteps] - A counter for the number of failed steps.
 * @property {Array<WorkflowExecutionLog>} logs - A collection of log entries generated during the execution.
 * @property {WorkflowExecutionResult} [result] - The final result of the workflow execution.
 * @property {WorkflowExecutionTopLevelError} [error] - Details of a fatal error that stopped the entire workflow.
 * @property {object} context - A flexible object for storing state, variables, and data that is passed between steps during execution.
 * @property {number} retryCount - The number of times this entire workflow execution has been retried.
 * @property {string} [parentExecutionId] - If this is a retry, this field stores the `executionId` of the original run.
 */
const WorkflowExecutionSchema = new mongoose.Schema(
  {
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    executionId: {
      type: String,
      required: true,
      unique: true, // `unique: true` automatically creates an index
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'awaiting_approval'],
      default: 'pending',
      index: true,
    },
    currentStepIndex: {
      type: Number,
      default: 0,
    },
    triggerType: {
      type: String,
      enum: ['schedule', 'manual', 'webhook', 'event'],
      required: true,
    },
    startTime: Date,
    endTime: Date,
    duration: Number, // in milliseconds
    steps: [WorkflowExecutionStepSchema],
    totalSteps: Number,
    completedSteps: Number,
    failedSteps: Number,
    logs: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        level: {
          type: String,
          enum: ['info', 'warn', 'error', 'debug'],
          default: 'info',
        },
        message: String,
        stepId: String,
        data: Object,
      },
    ],
    result: {
      success: Boolean,
      data: Object,
      summary: String,
    },
    error: {
      message: String,
      stack: String,
      stepId: String,
    },
    context: {
      type: Object,
      default: {}, // Store execution context and variables
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    parentExecutionId: String, // For retry relationships
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
// Common query: Find latest executions for a specific workflow
WorkflowExecutionSchema.index({ workflowId: 1, createdAt: -1 });
// Common query: Find latest executions for a user, often filtered by status
WorkflowExecutionSchema.index({ userId: 1, status: 1, createdAt: -1 });
// Common query: Find latest executions by status globally (e.g., for admin dashboards or workers)
WorkflowExecutionSchema.index({ status: 1, createdAt: -1 });
// OPTIMIZATION: Removed redundant `WorkflowExecutionSchema.index({ executionId: 1 });`
// The `unique: true` option on the `executionId` field already creates a unique index, making a separate index definition unnecessary.

/**
 * Mongoose model for Workflow Executions.
 * This model is used to create, read, update, and delete workflow execution records in the database.
 * The check `mongoose.models.WorkflowExecution || mongoose.model(...)` prevents
 * the "OverwriteModelError" in environments like Next.js or with hot-reloading
 * where the model might be re-compiled.
 * @type {mongoose.Model<mongoose.Document & typeof WorkflowExecutionSchema>}
 */
const WorkflowExecution =
  mongoose.models.WorkflowExecution ||
  mongoose.model('WorkflowExecution', WorkflowExecutionSchema);

export default WorkflowExecution;