import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['sales', 'support', 'research', 'productivity', 'marketing', 'engineering', 'hr', 'finance', 'custom'],
      required: true,
    },
    icon: {
      type: String,
      default: '🤖',
    },
    coverImage: {
      type: String,
    },
    agentConfig: {
      instructions: String,
      model: String,
      tools: [String],
      knowledgeBases: [String],
      swarmConfig: mongoose.Schema.Types.Mixed,
      humanApproval: mongoose.Schema.Types.Mixed,
    },
    workflowConfig: mongoose.Schema.Types.Mixed,
    triggerConfigs: [mongoose.Schema.Types.Mixed],
    tags: {
      type: [String],
      default: [],
    },
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
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    isOfficial: {
      type: Boolean,
      default: false,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

templateSchema.index({ category: 1 });
templateSchema.index({ tags: 1 });
templateSchema.index({ isOfficial: -1, usageCount: -1 });

const Template = mongoose.model('Template', templateSchema);

export default Template;
