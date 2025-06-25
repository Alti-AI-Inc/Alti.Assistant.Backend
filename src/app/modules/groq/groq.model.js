// import mongoose from 'mongoose';
import mongoose from "mongoose";

const llamaResponseSchema = new mongoose.Schema({
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
        // required: true,
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
});

const Llama = mongoose.model('Chat-History', llamaResponseSchema);

export default Llama;
