import mongoose from 'mongoose';

/**
 * @typedef {object} WorkflowExecutionStep
 * @property {number} step - The order of the step in the workflow.
 * @property {string} app - The name of the application to interact with (e.g., 'Gmail', 'Slack').
 * @property {string} action - The specific action to perform within the app (e.g., 'send_email', 'post_message').
 * @property {string} [description] - A human-readable description of what this step does.
 * @property {mongoose.Schema.Types.Mixed} parameters - Key-value pairs of parameters required for the action.
 * @property {number[]} [dependencies] - An array of step numbers that must complete before this step can run.
 * @property {mongoose.Schema.Types.Mixed} outputMapping - Defines how the output of this step maps to subsequent steps' inputs.
 */

/**
 * @typedef {object} ScheduleConfiguration
 * @property {Date} [triggerDate] - The specific date and time for a 'scheduled' trigger.
 * @property {string} [cronExpression] - A cron expression for 'recurring' triggers.
 * @property {string} [timezone='UTC'] - The timezone for interpreting triggerDate or cronExpression.
 * @property {boolean} [isActive=true] - Indicates if the schedule is currently active.
 * @property {'daily'|'weekly'|'monthly'|'custom'} [recurrencePattern] - The pattern for recurring schedules.
 */

/**
 * @typedef {object} ConnectedAccount
 * @property {string} app - The name of the application.
 * @property {string} connectedAccountId - The ID of the connected account for the app.
 * @property {string} status - The status of the connection (e.g., 'connected', 'disconnected').
 */

/**
 * @typedef {object} LastError
 * @property {string} error - The error message.
 * @property {Date} timestamp - The timestamp when the error occurred.
 * @property {number} [step] - The step number where the error occurred.
 */

/**
 * @typedef {object} ScheduledWorkflow
 * @property {string} workflowId - A unique identifier for the workflow.
 * @property {mongoose.Types.ObjectId} userId - The ID of the user who owns this workflow.
 * @property {string} title - The title of the workflow.
 * @property {string} [description] - A detailed description of the workflow.
 * @property {WorkflowExecutionStep[]} executionPlan - An ordered list of steps defining the workflow's actions.
 * @property {'single_step'|'multi_step'} workflowType - The type of workflow (e.g., single action, multiple actions).
 * @property {string[]} requiredApps - A list of applications required for this workflow.
 * @property {number} totalSteps - The total number of steps in the workflow.
 * @property {'manual'|'scheduled'|'recurring'} [triggerType='manual'] - How the workflow is initiated.
 * @property {ScheduleConfiguration} [scheduleConfig] - Configuration for scheduled or recurring triggers.
 * @property {'pending'|'active'|'paused'|'completed'|'failed'|'cancelled'} [status='pending'] - The current status of the workflow.
 * @property {Date} [lastExecution] - The timestamp of the last time the workflow was executed.
 * @property {Date} [nextExecution] - The timestamp of the next scheduled execution.
 * @property {number} [executionCount=0] - The total number of times the workflow has been attempted.
 * @property {number} [successCount=0] - The number of successful executions.
 * @property {number} [failureCount=0] - The number of failed executions.
 * @property {string} originalUserInput - The original natural language input from the user that led to this workflow.
 * @property {string} [conversationId] - The ID of the conversation context from which this workflow was created.
 * @property {mongoose.Schema.Types.Mixed} [conversationContext] - Additional context from the conversation.
 * @property {ConnectedAccount[]} [connectedAccounts] - List of app connections used at the time of workflow creation.
 * @property {LastError} [lastError] - Details of the last error encountered during execution.
 * @property {string} [createdBy='ai_classification_system'] - Identifier for the system or user that created the workflow.
 * @property {string[]} [tags] - Tags associated with the workflow for categorization.
 * @property {boolean} [isTemplate=false] - Indicates if this workflow is a template.
 * @property {Date} createdAt - Timestamp of when the workflow was created.
 * @property {Date} updatedAt - Timestamp of when the workflow was last updated.
 *
 * @property {number} successRate - Virtual field: The success rate of the workflow as a percentage.
 * @property {string} nextExecutionDisplay - Virtual field: A human-readable string for the next execution time.
 */

/**
 * Mongoose schema for the ScheduledWorkflow model.
 * Defines the structure and validation rules for storing scheduled workflows.
 *
 * @type {mongoose.Schema<ScheduledWorkflow>}
 */
const ScheduledWorkflowSchema = new mongoose.Schema(
  {
    /**
     * A unique identifier for the workflow.
     * @type {string}
     * @required
     * @unique
     * @index
     */
    workflowId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * The ID of the user who owns this workflow.
     * @type {mongoose.Types.ObjectId}
     * @ref 'User'
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
     * The title of the workflow.
     * @type {string}
     * @required
     * @trim
     */
    title: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * A detailed description of the workflow.
     * @type {string}
     * @trim
     */
    description: {
      type: String,
      trim: true,
    },

    /**
     * An ordered list of steps defining the workflow's actions.
     * Each step specifies an app, action, parameters, and dependencies.
     * @type {WorkflowExecutionStep[]}
     */
    executionPlan: [
      {
        /**
         * The order of the step in the workflow.
         * @type {number}
         * @required
         */
        step: {
          type: Number,
          required: true,
        },
        /**
         * The name of the application to interact with (e.g., 'Gmail', 'Slack').
         * @type {string}
         * @required
         */
        app: {
          type: String,
          required: true,
        },
        /**
         * The specific action to perform within the app (e.g., 'send_email', 'post_message').
         * @type {string}
         * @required
         */
        action: {
          type: String,
          required: true,
        },
        /**
         * A human-readable description of what this step does.
         * @type {string}
         */
        description: {
          type: String,
        },
        /**
         * Key-value pairs of parameters required for the action.
         * @type {mongoose.Schema.Types.Mixed}
         * @default {}
         */
        parameters: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
        /**
         * An array of step numbers that must complete before this step can run.
         * @type {number[]}
         */
        dependencies: [
          {
            type: Number,
          },
        ],
        /**
         * Defines how the output of this step maps to subsequent steps' inputs.
         * @type {mongoose.Schema.Types.Mixed}
         * @default {}
         */
        outputMapping: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],

    /**
     * The type of workflow (e.g., single action, multiple actions).
     * @type {'single_step'|'multi_step'}
     * @enum {string}
     * @required
     */
    workflowType: {
      type: String,
      enum: ['single_step', 'multi_step'],
      required: true,
    },
    /**
     * A list of applications required for this workflow.
     * @type {string[]}
     * @required
     */
    requiredApps: [
      {
        type: String,
        required: true,
      },
    ],
    /**
     * The total number of steps in the workflow.
     * @type {number}
     * @required
     * @min 1
     */
    totalSteps: {
      type: Number,
      required: true,
      min: 1,
    },

    /**
     * How the workflow is initiated.
     * @type {'manual'|'scheduled'|'recurring'}
     * @enum {string}
     * @default 'manual'
     */
    triggerType: {
      type: String,
      enum: ['manual', 'scheduled', 'recurring'],
      default: 'manual',
    },
    /**
     * Configuration for scheduled or recurring triggers.
     * @type {ScheduleConfiguration}
     */
    scheduleConfig: {
      /**
       * The specific date and time for a 'scheduled' trigger.
       * @type {Date}
       */
      triggerDate: {
        type: Date,
      },
      /**
       * A cron expression for 'recurring' triggers.
       * @type {string}
       */
      cronExpression: {
        type: String,
      },
      /**
       * The timezone for interpreting triggerDate or cronExpression.
       * @type {string}
       * @default 'UTC'
       */
      timezone: {
        type: String,
        default: 'UTC',
      },
      /**
       * Indicates if the schedule is currently active.
       * @type {boolean}
       * @default true
       */
      isActive: {
        type: Boolean,
        default: true,
      },
      /**
       * The pattern for recurring schedules.
       * @type {'daily'|'weekly'|'monthly'|'custom'}
       * @enum {string}
       */
      recurrencePattern: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'custom'],
      },
    },

    /**
     * The current status of the workflow.
     * @type {'pending'|'active'|'paused'|'completed'|'failed'|'cancelled'}
     * @enum {string}
     * @default 'pending'
     */
    status: {
      type: String,
      enum: ['pending', 'active', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    /**
     * The timestamp of the last time the workflow was executed.
     * @type {Date}
     */
    lastExecution: {
      type: Date,
    },
    /**
     * The timestamp of the next scheduled execution.
     * @type {Date}
     */
    nextExecution: {
      type: Date,
    },
    /**
     * The total number of times the workflow has been attempted.
     * @type {number}
     * @default 0
     */
    executionCount: {
      type: Number,
      default: 0,
    },
    /**
     * The number of successful executions.
     * @type {number}
     * @default 0
     */
    successCount: {
      type: Number,
      default: 0,
    },
    /**
     * The number of failed executions.
     * @type {number}
     * @default 0
     */
    failureCount: {
      type: Number,
      default: 0,
    },

    /**
     * The original natural language input from the user that led to this workflow.
     * @type {string}
     * @required
     */
    originalUserInput: {
      type: String,
      required: true,
    },
    /**
     * The ID of the conversation context from which this workflow was created.
     * @type {string}
     */
    conversationId: {
      type: String,
    },
    /**
     * Additional context from the conversation, stored as a mixed type.
     * @type {mongoose.Schema.Types.Mixed}
     */
    conversationContext: {
      type: mongoose.Schema.Types.Mixed,
    },

    /**
     * List of app connections used at the time of workflow creation.
     * @type {ConnectedAccount[]}
     */
    connectedAccounts: [
      {
        app: String,
        connectedAccountId: String,
        status: String,
      },
    ],

    /**
     * Details of the last error encountered during execution.
     * @type {LastError}
     */
    lastError: {
      error: String,
      timestamp: Date,
      step: Number,
    },

    /**
     * Identifier for the system or user that created the workflow.
     * @type {string}
     * @default 'ai_classification_system'
     */
    createdBy: {
      type: String,
      default: 'ai_classification_system',
    },
    /**
     * Tags associated with the workflow for categorization.
     * @type {string[]}
     */
    tags: [
      {
        type: String,
      },
    ],
    /**
     * Indicates if this workflow is a template.
     * @type {boolean}
     * @default false
     */
    isTemplate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Defines indexes for the ScheduledWorkflowSchema to improve query performance.
 * - `userId` and `status` for efficient user-specific status queries.
 * - `triggerType` and `scheduleConfig.isActive` for finding active scheduled/recurring workflows.
 * - `nextExecution` and `status` for quickly identifying workflows due for execution.
 * - `requiredApps` for queries based on required applications.
 * - `createdAt` for sorting by creation date.
 */
ScheduledWorkflowSchema.index({ userId: 1, status: 1 });
ScheduledWorkflowSchema.index({ triggerType: 1, 'scheduleConfig.isActive': 1 });
ScheduledWorkflowSchema.index({ nextExecution: 1, status: 1 });
ScheduledWorkflowSchema.index({ requiredApps: 1 });
ScheduledWorkflowSchema.index({ createdAt: -1 });

/**
 * Virtual field `successRate`.
 * Calculates the success rate of the workflow as a percentage.
 * Returns 0 if `executionCount` is 0 to avoid division by zero.
 * @returns {number} The success rate as a percentage (0-100).
 */
ScheduledWorkflowSchema.virtual('successRate').get(function () {
  if (this.executionCount === 0) return 0;
  return Math.round((this.successCount / this.executionCount) * 100);
});

/**
 * Virtual field `nextExecutionDisplay`.
 * Provides a human-readable string for the next execution time.
 * Returns 'Not scheduled' if `nextExecution` is not set.
 * @returns {string} The localized string representation of `nextExecution` or 'Not scheduled'.
 */
ScheduledWorkflowSchema.virtual('nextExecutionDisplay').get(function () {
  if (!this.nextExecution) return 'Not scheduled';
  return this.nextExecution.toLocaleString();
});

/**
 * Instance method to update the execution statistics of a workflow.
 * Increments `executionCount`, sets `lastExecution`, and updates `successCount` or `failureCount`
 * based on the `success` parameter. Adjusts `status` accordingly for manual workflows.
 *
 * @param {boolean} success - True if the execution was successful, false otherwise.
 * @returns {Promise<ScheduledWorkflow>} The updated ScheduledWorkflow document.
 */
ScheduledWorkflowSchema.methods.updateExecutionStats = function (success) {
  this.executionCount += 1;
  this.lastExecution = new Date();

  if (success) {
    this.successCount += 1;
    this.status = this.triggerType === 'manual' ? 'completed' : 'active';
  } else {
    this.failureCount += 1;
    // Don't change status to failed for recurring workflows
    if (this.triggerType === 'manual') {
      this.status = 'failed';
    }
  }

  return this.save();
};

/**
 * Instance method to pause a workflow.
 * Sets the workflow's status to 'paused' and deactivates its schedule configuration.
 *
 * @returns {Promise<ScheduledWorkflow>} The updated ScheduledWorkflow document.
 */
ScheduledWorkflowSchema.methods.pause = function () {
  this.status = 'paused';
  this.scheduleConfig.isActive = false;
  return this.save();
};

/**
 * Instance method to resume a paused workflow.
 * Sets the workflow's status to 'active' and reactivates its schedule configuration.
 *
 * @returns {Promise<ScheduledWorkflow>} The updated ScheduledWorkflow document.
 */
ScheduledWorkflowSchema.methods.resume = function () {
  this.status = 'active';
  this.scheduleConfig.isActive = true;
  return this.save();
};

/**
 * Instance method to cancel a workflow.
 * Sets the workflow's status to 'cancelled' and deactivates its schedule configuration.
 *
 * @returns {Promise<ScheduledWorkflow>} The updated ScheduledWorkflow document.
 */
ScheduledWorkflowSchema.methods.cancel = function () {
  this.status = 'cancelled';
  this.scheduleConfig.isActive = false;
  return this.save();
};

/**
 * Static method to find workflows by user ID, optionally filtered by status.
 * Sorts results by creation date in descending order.
 *
 * @param {mongoose.Types.ObjectId} userId - The ID of the user.
 * @param {string} [status=null] - Optional status to filter by (e.g., 'active', 'completed').
 * @returns {mongoose.Query<ScheduledWorkflow[], ScheduledWorkflow>} A Mongoose query object.
 */
ScheduledWorkflowSchema.statics.findByUser = function (userId, status = null) {
  const query = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

/**
 * Static method to find workflows that are active, scheduled, and due for execution.
 * A workflow is due if its `nextExecution` date is less than or equal to the current date.
 *
 * @returns {mongoose.Query<ScheduledWorkflow[], ScheduledWorkflow>} A Mongoose query object.
 */
ScheduledWorkflowSchema.statics.findDueForExecution = function () {
  return this.find({
    status: 'active',
    'scheduleConfig.isActive': true,
    nextExecution: { $lte: new Date() },
  });
};

/**
 * Static method to generate a unique workflow ID.
 * Combines a timestamp with a random alphanumeric string.
 *
 * @returns {string} A newly generated unique workflow ID.
 */
ScheduledWorkflowSchema.statics.generateWorkflowId = function () {
  return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Mongoose model for ScheduledWorkflow.
 * Provides an interface to the database for ScheduledWorkflow documents.
 *
 * @type {mongoose.Model<ScheduledWorkflow>}
 */
const ScheduledWorkflow = mongoose.model(
  'ScheduledWorkflow',
  ScheduledWorkflowSchema
);

/**
 * Exports the ScheduledWorkflow Mongoose model.
 * @module ScheduledWorkflowModel
 */
export default ScheduledWorkflow;