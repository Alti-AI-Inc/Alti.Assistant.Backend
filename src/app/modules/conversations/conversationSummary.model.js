import { Schema, model } from 'mongoose';

const conversationSummarySchema = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
    },
    context: {
      type: String,
      default: '',
    },
    messageRange: {
      startIndex: {
        type: Number,
        required: true,
      },
      endIndex: {
        type: Number,
        required: true,
      },
      totalMessages: {
        type: Number,
        required: true,
      },
    },
    tokenCount: {
      type: Number,
      required: true,
    },
    metadata: {
      keyTopics: [String],
      entities: [String],
      detectedApps: [String],
      summaryVersion: {
        type: String,
        default: '1.0',
      },
    },
    status: {
      type: String,
      enum: ['active', 'archived', 'superseded'],
      default: 'active',
    },
  },
  {
    timestamps: true,
    collection: 'conversation_summaries',
  }
);

// Compound index for efficient queries
conversationSummarySchema.index({ conversationId: 1, userId: 1 });
conversationSummarySchema.index({ conversationId: 1, status: 1 });

// Static method to find active summary for a conversation
conversationSummarySchema.statics.findActiveForConversation = function (conversationId, userId) {
  return this.findOne({
    conversationId,
    userId,
    status: 'active'
  }).sort({ createdAt: -1 });
};

// Static method to get all summaries for a conversation
conversationSummarySchema.statics.getAllForConversation = function (conversationId, userId) {
  return this.find({
    conversationId,
    userId
  }).sort({ 'messageRange.startIndex': 1 });
};

const ConversationSummary = model('ConversationSummary', conversationSummarySchema);

export default ConversationSummary;
