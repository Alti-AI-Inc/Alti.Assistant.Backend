import mongoose, { Schema } from "mongoose";

export const CodeChatSessionSchema = new mongoose.Schema({
  thread_id: {
    type: String,
    required: true,
    unique: true,
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  history: {
    type: Schema.Types.Mixed
  }
})