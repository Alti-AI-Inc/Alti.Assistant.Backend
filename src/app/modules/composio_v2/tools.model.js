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
  }
})

const Tool = mongoose.model("Tool", ToolSchema);

export default Tool;