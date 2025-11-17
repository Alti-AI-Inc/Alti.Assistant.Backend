import mongoose from "mongoose";

const ToolSchema = mongoose.Schema({
  slug: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: false
  },
  appName: {
    type: String,
    required: false
  },
  // Embedding field for vector search
  embedding: {
    type: [Number],
    required: false
    // Note: Vector index should be created in MongoDB Atlas, not here
  }
}, {
  strict: false // Allow additional fields that might come from Composio
});

const Tool = mongoose.model("Tool", ToolSchema);

export default Tool;