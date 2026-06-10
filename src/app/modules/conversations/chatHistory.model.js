import mongoose from 'mongoose';

const chatHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, // INTEGRATION: A chat history must always be associated with a user.
    index: true,
  },
  sessionId: {
    type: String,
    required: true, // INTEGRATION: Session ID is crucial for grouping messages and context.
  },
  responses: [
    {
      prompt: {
        type: String,
        required: true,
      },
      model: {
        type: String,
        required: true,
      },
      reply: {
        type: String,
        // Reply might not exist if there was an error, so it is not required.
      },
      search_results: [
        {
          title: {
            type: String,
            required: true,
          },
          link: {
            type: String,
            required: true,
          },
          snippet: {
            type: String,
            required: true,
          },
          position: {
            type: Number,
            required: true,
          },
        },
      ],
      total_time: {
        type: Number, // BUGFIX: Changed from String to Number for calculations and aggregations.
        required: true,
      },
      // CRITICAL INTEGRATION: Added token counts for usage tracking, limits, and billing propagation.
      prompt_tokens: {
        type: Number,
        required: true,
        default: 0,
      },
      completion_tokens: {
        type: Number,
        required: true,
        default: 0,
      },
    },
  ],
  createdAt: { type: Date, default: Date.now },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true, // SECURITY: All data must be scoped to a tenant to prevent data leakage.
    index: true,
  },
  // CRITICAL INTEGRATION: Added workspaceId for granular context and role validation.
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true, // SECURITY: Actions and data must be contained within a specific workspace.
    index: true,
  },
});

// Indexes for better query performance in production
// CRITICAL: Compound index for the most common multi-tenant query pattern.
chatHistorySchema.index({ tenantId: 1, workspaceId: 1, user: 1, createdAt: -1 });
chatHistorySchema.index({ tenantId: 1, workspaceId: 1, sessionId: 1 });
// The legacy index { user: 1, createdAt: -1 } is removed as it encourages queries
// that bypass tenant and workspace scoping, which is a security risk.
// The `user` field is already individually indexed via `index: true` in its definition.

const ChatHistory = mongoose.model('Chat-History', chatHistorySchema);

export default ChatHistory;