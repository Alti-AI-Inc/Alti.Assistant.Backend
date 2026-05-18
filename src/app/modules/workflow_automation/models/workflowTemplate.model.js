import mongoose from 'mongoose';

const WorkflowTemplateStepSchema = new mongoose.Schema({
  stepId: String,
  stepType: {
    type: String,
    enum: ['action', 'condition', 'trigger', 'delay'],
    required: true,
  },
  description: String,
  app: String,
  action: String,
  parameters: Object,
  parameterSchema: Object, // Schema for parameter validation
  conditions: Object,
  order: Number,
});

const WorkflowTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
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
      required: true,
    },
    tags: [String],
    steps: [WorkflowTemplateStepSchema],
    triggerTypes: [
      {
        type: String,
        enum: ['schedule', 'webhook', 'manual', 'event'],
      },
    ],
    requiredApps: [String],
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    rating: {
      average: {
        type: Number,
        default: 0,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    examples: [
      {
        prompt: String,
        description: String,
      },
    ],
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
WorkflowTemplateSchema.index({ category: 1, isPublic: 1 });
WorkflowTemplateSchema.index({ tags: 1, isPublic: 1 });
WorkflowTemplateSchema.index({ 'rating.average': -1, usageCount: -1 });

// Check if model is already compiled to prevent OverwriteModelError
const WorkflowTemplate =
  mongoose.models.WorkflowTemplate ||
  mongoose.model('WorkflowTemplate', WorkflowTemplateSchema);

export default WorkflowTemplate;
