import mongoose from 'mongoose';

const DocumentRelationshipSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    sourceDocId: {
      type: String,
      required: true,
      index: true
    },
    targetDocId: {
      type: String,
      required: true,
      index: true
    },
    relationType: {
      type: String,
      required: true,
      enum: ['shared_entity', 'cross_reference', 'hierarchical', 'dependency', 'topic_similarity'],
      default: 'topic_similarity'
    },
    confidence: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1
    },
    sharedConcepts: {
      type: [String],
      default: []
    },
    description: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Compound index to speed up traversing from a source document
DocumentRelationshipSchema.index({ userId: 1, sourceDocId: 1, targetDocId: 1 }, { unique: true });

const DocumentRelationship = mongoose.models.DocumentRelationship || mongoose.model('DocumentRelationship', DocumentRelationshipSchema);

export default DocumentRelationship;
