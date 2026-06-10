import mongoose from 'mongoose';

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

// Check if model is already compiled to prevent OverwriteModelError
const WorkflowExecution =
  mongoose.models.WorkflowExecution ||
  mongoose.model('WorkflowExecution', WorkflowExecutionSchema);

export default WorkflowExecution;