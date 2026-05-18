import mongoose from 'mongoose';

const ScheduledWorkflowSchema = new mongoose.Schema(
  {
    // Basic workflow information
    workflowId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // Workflow execution details
    executionPlan: [
      {
        step: {
          type: Number,
          required: true,
        },
        app: {
          type: String,
          required: true,
        },
        action: {
          type: String,
          required: true,
        },
        description: {
          type: String,
        },
        parameters: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
        dependencies: [
          {
            type: Number,
          },
        ],
        outputMapping: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
    ],

    // Workflow metadata
    workflowType: {
      type: String,
      enum: ['single_step', 'multi_step'],
      required: true,
    },
    requiredApps: [
      {
        type: String,
        required: true,
      },
    ],
    totalSteps: {
      type: Number,
      required: true,
      min: 1,
    },

    // Trigger configuration
    triggerType: {
      type: String,
      enum: ['manual', 'scheduled', 'recurring'],
      default: 'manual',
    },
    scheduleConfig: {
      triggerDate: {
        type: Date,
      },
      cronExpression: {
        type: String,
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      recurrencePattern: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'custom'],
      },
    },

    // Status and execution tracking
    status: {
      type: String,
      enum: ['pending', 'active', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    lastExecution: {
      type: Date,
    },
    nextExecution: {
      type: Date,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },

    // Original conversation context
    originalUserInput: {
      type: String,
      required: true,
    },
    conversationId: {
      type: String,
    },
    conversationContext: {
      type: mongoose.Schema.Types.Mixed,
    },

    // App connections at time of creation
    connectedAccounts: [
      {
        app: String,
        connectedAccountId: String,
        status: String,
      },
    ],

    // Error handling
    lastError: {
      error: String,
      timestamp: Date,
      step: Number,
    },

    // Metadata
    createdBy: {
      type: String,
      default: 'ai_classification_system',
    },
    tags: [
      {
        type: String,
      },
    ],
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

// Indexes for performance
ScheduledWorkflowSchema.index({ userId: 1, status: 1 });
ScheduledWorkflowSchema.index({ triggerType: 1, 'scheduleConfig.isActive': 1 });
ScheduledWorkflowSchema.index({ nextExecution: 1, status: 1 });
ScheduledWorkflowSchema.index({ requiredApps: 1 });
ScheduledWorkflowSchema.index({ createdAt: -1 });

// Virtual for execution success rate
ScheduledWorkflowSchema.virtual('successRate').get(function () {
  if (this.executionCount === 0) return 0;
  return Math.round((this.successCount / this.executionCount) * 100);
});

// Virtual for next execution display
ScheduledWorkflowSchema.virtual('nextExecutionDisplay').get(function () {
  if (!this.nextExecution) return 'Not scheduled';
  return this.nextExecution.toLocaleString();
});

// Methods
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

ScheduledWorkflowSchema.methods.pause = function () {
  this.status = 'paused';
  this.scheduleConfig.isActive = false;
  return this.save();
};

ScheduledWorkflowSchema.methods.resume = function () {
  this.status = 'active';
  this.scheduleConfig.isActive = true;
  return this.save();
};

ScheduledWorkflowSchema.methods.cancel = function () {
  this.status = 'cancelled';
  this.scheduleConfig.isActive = false;
  return this.save();
};

// Static methods
ScheduledWorkflowSchema.statics.findByUser = function (userId, status = null) {
  const query = { userId };
  if (status) query.status = status;
  return this.find(query).sort({ createdAt: -1 });
};

ScheduledWorkflowSchema.statics.findDueForExecution = function () {
  return this.find({
    status: 'active',
    'scheduleConfig.isActive': true,
    nextExecution: { $lte: new Date() },
  });
};

ScheduledWorkflowSchema.statics.generateWorkflowId = function () {
  return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const ScheduledWorkflow = mongoose.model(
  'ScheduledWorkflow',
  ScheduledWorkflowSchema
);

export default ScheduledWorkflow;
