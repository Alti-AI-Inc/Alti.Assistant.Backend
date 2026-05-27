import mongoose from 'mongoose';

const chatHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: String,
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
        type: String,
        required: true,
      },
    },
  ],
  createdAt: { type: Date, default: Date.now },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

const ChatHistory = mongoose.model('Chat-History', chatHistorySchema);

export default ChatHistory;
