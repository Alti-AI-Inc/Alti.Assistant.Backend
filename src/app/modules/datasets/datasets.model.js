import mongoose from 'mongoose';

const DatasetSchema = new mongoose.Schema(
  {
    datasetId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
      // Associates dataset with a workspace for admin management, billing limits, and subscription controls
    },
    name: {
      type: String,
      required: true,
    },
    author: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: '',
    },
    downloads: {
      type: Number,
      default: 0,
    },
    likes: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    gcsBucket: {
      type: String,
      default: '',
    },
    gcsPaths: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'downloading', 'archived', 'indexing', 'indexed', 'failed'],
      default: 'pending',
    },
    error: {
      type: String,
      default: '',
    },
    configs: {
      type: [String],
      default: [],
    },
    splits: {
      type: mongoose.Schema.Types.Mixed, // Stores splits per config
      default: {},
    },
    rowCount: {
      type: Number,
      default: 0,
    },
    sizeBytes: {
      type: Number,
      default: 0, // Used by admins to calculate workspace storage usage against subscription limits
    },
    features: {
      type: mongoose.Schema.Types.Mixed, // Dynamic schema features/columns from HF
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Enable full-text search on name and description
DatasetSchema.index(
  { datasetId: 'text', name: 'text', description: 'text' },
  { weights: { datasetId: 10, name: 5, description: 1 }, name: 'DatasetTextIndex' }
);

// Compound indexes for fast workspace-specific dataset queries and aggregation of storage limits
DatasetSchema.index({ workspaceId: 1, status: 1 });
DatasetSchema.index({ workspaceId: 1, sizeBytes: 1 });

const Dataset = mongoose.models.Dataset || mongoose.model('Dataset', DatasetSchema);

export default Dataset;