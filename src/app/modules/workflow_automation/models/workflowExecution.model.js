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
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
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
WorkflowExecutionSchema.index({ workflowId: 1, createdAt: -1 });
WorkflowExecutionSchema.index({ userId: 1, status: 1, createdAt: -1 });
WorkflowExecutionSchema.index({ status: 1, createdAt: -1 });
WorkflowExecutionSchema.index({ executionId: 1 });

// Check if model is already compiled to prevent OverwriteModelError
const WorkflowExecution =
  mongoose.models.WorkflowExecution ||
  mongoose.model('WorkflowExecution', WorkflowExecutionSchema);

export default WorkflowExecution;
