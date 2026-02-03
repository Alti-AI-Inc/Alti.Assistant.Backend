import mongoose from 'mongoose';

const OpenRouterSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  responses: [
    {
      prompt: String,
      model: String,
      response: String,
      total_time: Number,
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

export const OpenRouterSession = mongoose.model(
  'OpenRouterSession',
  OpenRouterSessionSchema,
);
