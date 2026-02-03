const mongoose = require('mongoose');

const wishperSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User',required: true },
  sessionId: String,
  responses: [
    {
      response: String,
      prompt: String,
      done: Boolean,
      total_duration: Number,
      load_duration: Number,
      created_at: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

const WishperAiSession = mongoose.model('Wishper', wishperSessionSchema);

module.exports = WishperAiSession;