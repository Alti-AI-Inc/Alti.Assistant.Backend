import mongoose from 'mongoose';

const WorkflowStepSchema = new mongoose.Schema({
  stepId: {
    type: String,
    required: true,
  },
  stepType: {
    type: String,
    enum: ['action', 'condition', 'trigger', 'delay'],
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  app: {
    type: String, // e.g., 'gmail', 'slack', 'twitter'
    required: true,
  },
  action: {
    type: String, // e.g., 'send_email', 'post_message'
    required: true,
  },
  parameters: {
    type: Object, // Dynamic parameters for the action
    default: {},
  },
  conditions: {
    type: Object, // Conditional logic if needed
    default: {},
  },
  order: {
    type: Number,
    required: true,
  },
  requireApproval: {
    type: Boolean,
    default: false,
  },
});

const WorkflowTriggerSchema = new mongoose.Schema({
  triggerType: {
    type: String,
    enum: ['schedule', 'webhook', 'manual', 'event'],
    required: true,
  },
  scheduleConfig: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'hourly', 'custom'],
    },
    time: String, // Format: "HH:mm" for daily/weekly
    timezone: {
      type: String,
      default: 'UTC',
    },
    daysOfWeek: [Number], // 0-6, Sunday to Saturday
    dayOfMonth: Number, // 1-31 for monthly
    cronExpression: String, // For custom schedules
  },
  webhookConfig: {
    url: String,
    secret: String,
    headers: Object,
  },
  eventConfig: {
    app: String,
    eventType: String,
    filters: Object,
  },
});

const WorkflowSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    originalPrompt: {
      type: String,
      required: true, // The original user prompt that created this workflow
    },
    steps: [WorkflowStepSchema],
    trigger: WorkflowTriggerSchema,
    status: {
      type: String,
      enum: ['active', 'inactive', 'paused', 'error'],
      default: 'active',
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      enum: [
        'email',
        'social',
        'productivity',
        'finance',
        'communication',
        'other',
      ],
      default: 'other',
    },
    requiredApps: [
      {
        app: String,
        connected: {
          type: Boolean,
          default: false,
        },
        authConfigId: String,
      },
    ],
    executionCount: {
      type: Number,
      default: 0,
    },
    lastExecuted: Date,
    nextExecution: Date,
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
WorkflowSchema.index({ userId: 1, status: 1 });
WorkflowSchema.index({ nextExecution: 1, status: 1 });
WorkflowSchema.index({ userId: 1, category: 1 });

// Check if model is already compiled to prevent OverwriteModelError
const Workflow =
  mongoose.models.Workflow || mongoose.model('Workflow', WorkflowSchema);

export default Workflow;
