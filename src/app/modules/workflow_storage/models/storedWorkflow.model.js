import mongoose from 'mongoose';

const storedWorkflowSchema = new mongoose.Schema(
  {
    workflowId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    workflowType: {
      type: String,
      enum: ['single_step', 'multi_step'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'ready', 'archived'],
      default: 'draft',
      index: true,
    },
    requiredApps: [
      {
        type: String,
        required: true,
      },
    ],
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
    totalSteps: {
      type: Number,
      required: true,
      min: 1,
    },
    crossStepParameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    originalUserInput: {
      type: String,
      required: true,
    },
    planningMetadata: {
      reasoning: String,
      confidence: Number,
      planningTime: Date,
      executionType: String,
    },
    conversationId: {
      type: String,
      index: true,
    },
    conversationContext: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    connectedAccounts: [
      {
        type: mongoose.Schema.Types.Mixed,
      },
    ],
    missingConnections: [
      {
        type: String,
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    category: {
      type: String,
      enum: [
        'automation',
        'data_processing',
        'communication',
        'productivity',
        'integration',
        'other',
      ],
      default: 'other',
    },
    isTemplate: {
      type: Boolean,
      default: false,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
    lastExecuted: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
storedWorkflowSchema.index({ userId: 1, status: 1 });
storedWorkflowSchema.index({ userId: 1, workflowType: 1 });
storedWorkflowSchema.index({ userId: 1, createdAt: -1 });
storedWorkflowSchema.index({ requiredApps: 1 });
storedWorkflowSchema.index({ tags: 1 });
storedWorkflowSchema.index({ category: 1 });

// Virtual fields
storedWorkflowSchema.virtual('isExecutable').get(function () {
  return (
    this.status === 'ready' &&
    (!this.missingConnections || this.missingConnections.length === 0)
  );
});

storedWorkflowSchema.virtual('complexity').get(function () {
  if (this.totalSteps === 1) return 'simple';
  if (this.totalSteps <= 3) return 'medium';
  return 'complex';
});

// Static methods
storedWorkflowSchema.statics.generateWorkflowId = function () {
  return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

storedWorkflowSchema.statics.findByUserId = function (userId, options = {}) {
  const {
    status = null,
    workflowType = null,
    category = null,
    limit = 50,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = -1,
  } = options;

  let query = { userId };

  if (status) query.status = status;
  if (workflowType) query.workflowType = workflowType;
  if (category) query.category = category;

  return this.find(query)
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(offset);
};

storedWorkflowSchema.statics.findExecutableWorkflows = function (userId) {
  return this.find({
    userId,
    status: 'ready',
    $or: [
      { missingConnections: { $exists: false } },
      { missingConnections: { $size: 0 } },
    ],
  });
};

storedWorkflowSchema.statics.searchWorkflows = function (
  userId,
  searchTerm,
  options = {}
) {
  const { limit = 20, offset = 0 } = options;

  return this.find({
    userId,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { originalUserInput: { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset);
};

// Instance methods
storedWorkflowSchema.methods.markAsExecuted = function () {
  this.executionCount += 1;
  this.lastExecuted = new Date();
  return this.save();
};

storedWorkflowSchema.methods.updateConnections = function (connectedAccounts) {
  this.connectedAccounts = connectedAccounts;

  // Update missing connections
  const connectedAppSlugs =
    connectedAccounts?.map((acc) => acc.toolkit?.slug || acc.app) || [];
  this.missingConnections = this.requiredApps.filter(
    (app) => !connectedAppSlugs.includes(app)
  );

  // Update status based on connections
  if (this.missingConnections.length === 0 && this.status === 'draft') {
    this.status = 'ready';
  } else if (this.missingConnections.length > 0) {
    this.status = 'draft';
  }

  return this.save();
};

storedWorkflowSchema.methods.addTags = function (newTags) {
  const currentTags = this.tags || [];
  const tagsToAdd = Array.isArray(newTags) ? newTags : [newTags];
  const uniqueTags = [...new Set([...currentTags, ...tagsToAdd])];
  this.tags = uniqueTags;
  return this.save();
};

storedWorkflowSchema.methods.removeTags = function (tagsToRemove) {
  const tagsArray = Array.isArray(tagsToRemove) ? tagsToRemove : [tagsToRemove];
  this.tags = (this.tags || []).filter((tag) => !tagsArray.includes(tag));
  return this.save();
};

// Pre-save middleware
storedWorkflowSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const StoredWorkflow = mongoose.model('StoredWorkflow', storedWorkflowSchema);

export default StoredWorkflow;
