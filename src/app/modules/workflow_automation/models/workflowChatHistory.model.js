import mongoose from 'mongoose';

const ChatMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  metadata: {
    type: Object,
    default: {},
  },
});

const WorkflowChatHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    messages: [ChatMessageSchema],
    workflowIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workflow',
      },
    ],
    context: {
      type: Object,
      default: {}, // Store conversation context and state
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      userIntent: String,
      extractedEntities: Object,
      detectedApps: [String],
      workflowType: String,
      complexity: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
WorkflowChatHistorySchema.index({ userId: 1, lastActivity: -1 });
WorkflowChatHistorySchema.index({ conversationId: 1 });
WorkflowChatHistorySchema.index({ userId: 1, status: 1 });

// Check if model is already compiled to prevent OverwriteModelError
const WorkflowChatHistory =
  mongoose.models.WorkflowChatHistory ||
  mongoose.model('WorkflowChatHistory', WorkflowChatHistorySchema);

export default WorkflowChatHistory;
