import mongoose from 'mongoose';

const LlamaDocumentSchema = new mongoose.Schema(
  {
    collectionId: { type: String, required: true, index: true },
    documentId: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    indexed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const LlamaDocument = mongoose.model('LlamaDocument', LlamaDocumentSchema);
