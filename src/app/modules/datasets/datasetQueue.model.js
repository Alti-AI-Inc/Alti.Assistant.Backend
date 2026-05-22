import mongoose from 'mongoose';

const DatasetQueueSchema = new mongoose.Schema(
  {
    datasetId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    downloads: {
      type: Number,
      default: 0,
      index: true,
    },
    likes: {
      type: Number,
      default: 0,
    },
    license: {
      type: String,
      default: '',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    skipReason: {
      type: String,
      default: '',
    },
    error: {
      type: String,
      default: '',
    },
    lastAttemptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const DatasetQueue = mongoose.models.DatasetQueue || mongoose.model('DatasetQueue', DatasetQueueSchema);

export default DatasetQueue;
