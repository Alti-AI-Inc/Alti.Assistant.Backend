import mongoose from "mongoose";

const chatResponseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  title: { type: String, default: 'New Chat' },
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
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },

  // Multi-tenant support
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

// Auto-update updatedAt on save
chatResponseSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  // Auto-title from first prompt if still default
  if (this.title === 'New Chat' && this.responses.length > 0) {
    this.title = this.responses[0].prompt.substring(0, 80);
  }
  next();
});

// Compound index for listing user sessions efficiently
chatResponseSchema.index({ user: 1, updatedAt: -1 });
chatResponseSchema.index({ user: 1, sessionId: 1 }, { unique: true });

const Chat = mongoose.model('Chat-History', chatResponseSchema);

export default Chat;