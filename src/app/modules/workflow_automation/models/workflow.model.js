/**
 * @file Defines the Mongoose schemas and models for Workflow automation.
 * @module models/workflow.model
 * @author Your Name/Organization
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} WorkflowStep
 * @property {string} stepId - A unique identifier for the workflow step.
 * @property {'action'|'condition'|'trigger'|'delay'} stepType - The type of the workflow step.
 * @property {string} description - A brief description of what this step does.
 * @property {string} app - The application associated with this step (e.g., 'gmail', 'slack', 'twitter').
 * @property {string} action - The specific action to be performed within the app (e.g., 'send_email', 'post_message').
 * @property {object} parameters - Dynamic parameters required for the action. Defaults to an empty object.
 * @property {object} conditions - Conditional logic that must be met for this step to execute. Defaults to an empty object.
 * @property {number} order - The sequential order of this step within the workflow.
 * @property {boolean} requireApproval - Indicates if this step requires manual approval before execution. Defaults to false.
 */
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

/**
 * @typedef {object} ScheduleConfig
 * @property {'daily'|'weekly'|'monthly'|'hourly'|'custom'} [frequency] - How often the workflow should run.
 * @property {string} [time] - The specific time for daily/weekly schedules (e.g., "HH:mm").
 * @property {string} [timezone='UTC'] - The timezone for schedule configuration.
 * @property {number[]} [daysOfWeek] - An array of numbers (0-6, Sunday to Saturday) for weekly schedules.
 * @property {number} [dayOfMonth] - The day of the month (1-31) for monthly schedules.
 * @property {string} [cronExpression] - A custom cron expression for advanced scheduling.
 */

/**
 * @typedef {object} WebhookConfig
 * @property {string} [url] - The URL to which the webhook should send requests.
 * @property {string} [secret] - A secret key for webhook authentication.
 * @property {object} [headers] - Custom headers to be sent with webhook requests.
 */

/**
 * @typedef {object} EventConfig
 * @property {string} [app] - The application generating the event.
 * @property {string} [eventType] - The specific type of event to listen for.
 * @property {object} [filters] - Criteria to filter incoming events.
 */

/**
 * @typedef {object} WorkflowTrigger
 * @property {'schedule'|'webhook'|'manual'|'event'} triggerType - The mechanism that initiates the workflow.
 * @property {ScheduleConfig} [scheduleConfig] - Configuration details for scheduled triggers.
 * @property {WebhookConfig} [webhookConfig] - Configuration details for webhook triggers.
 * @property {EventConfig} [eventConfig] - Configuration details for event-based triggers.
 */
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

/**
 * @typedef {object} RequiredApp
 * @property {string} app - The name of the required application.
 * @property {boolean} [connected=false] - Indicates if the application is connected for the user.
 * @property {string} [authConfigId] - The ID of the authentication configuration for this app.
 */

/**
 * @typedef {object} Workflow
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who owns this workflow. Indexed for efficient querying.
 * @property {string} name - The name of the workflow.
 * @property {string} [description] - A detailed description of the workflow.
 * @property {string} originalPrompt - The original user prompt that was used to create this workflow.
 * @property {WorkflowStep[]} steps - An array of steps that define the workflow's execution logic.
 * @property {WorkflowTrigger} trigger - The trigger configuration that initiates the workflow.
 * @property {'active'|'inactive'|'paused'|'error'} [status='active'] - The current operational status of the workflow.
 * @property {boolean} [isTemplate=false] - Indicates if this workflow is a template that can be reused.
 * @property {'email'|'social'|'productivity'|'finance'|'communication'|'other'} [category='other'] - The category this workflow belongs to.
 * @property {RequiredApp[]} requiredApps - A list of applications required by this workflow and their connection status.
 * @property {number} [executionCount=0] - The number of times this workflow has been executed.
 * @property {Date} [lastExecuted] - The timestamp of the last successful execution.
 * @property {Date} [nextExecution] - The timestamp of the next scheduled execution.
 * @property {object} [metadata={}] - Additional metadata associated with the workflow.
 * @property {Date} createdAt - The timestamp when the workflow was created.
 * @property {Date} updatedAt - The timestamp when the workflow was last updated.
 */
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

// Index for efficient querying by user and status
WorkflowSchema.index({ userId: 1, status: 1 });
// Index for efficient querying of workflows needing execution
WorkflowSchema.index({ nextExecution: 1, status: 1 });
// Index for efficient querying by user and category
WorkflowSchema.index({ userId: 1, category: 1 });

/**
 * Represents the Workflow model.
 * If the model already exists, it uses the existing one to prevent OverwriteModelError.
 * @type {mongoose.Model<Workflow>}
 */
const Workflow =
  mongoose.models.Workflow || mongoose.model('Workflow', WorkflowSchema);

export default Workflow;