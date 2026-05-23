import mongoose from 'mongoose';

const DocumentMetadataSchema = new mongoose.Schema(
  {
    docId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    summary: {
      type: String,
      required: true
    },
    topics: {
      type: [String],
      default: []
    },
    entities: {
      type: [String],
      default: []
    },
    complexity: {
      type: String,
      enum: ['Elementary', 'Intermediate', 'Advanced', 'Highly Technical'],
      default: 'Intermediate'
    },
    audience: {
      type: String,
      default: 'General'
    },
    temporalContext: {
      type: String,
      default: 'Timeless'
    }
  },
  {
    timestamps: true
  }
);

// Compound unique index per user and document
DocumentMetadataSchema.index({ userId: 1, docId: 1 }, { unique: true });

const DocumentMetadata = mongoose.models.DocumentMetadata || mongoose.model('DocumentMetadata', DocumentMetadataSchema);

export default DocumentMetadata;
