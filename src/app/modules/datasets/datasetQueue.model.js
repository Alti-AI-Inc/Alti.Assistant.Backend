import mongoose from 'mongoose';

/**
 * @file Defines the Mongoose schema and model for the dataset processing queue.
 * Each document represents a dataset that is pending, being processed, or has completed processing,
 * and is associated with a specific workspace and user.
 */
const DatasetQueueSchema = new mongoose.Schema(
  {
    // Reference to the workspace that owns this queued dataset.
    // Essential for enforcing workspace-specific limits, billing, and authorization.
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace', // Assumes a 'Workspace' model exists.
      required: [true, 'Workspace ID is required to queue a dataset.'],
      index: true,
    },
    // Reference to the user who initiated the dataset processing job.
    // Important for auditing, user-level permissions, and admin oversight.
    queuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Assumes a 'User' model exists.
      required: [true, 'User ID is required to queue a dataset.'],
      index: true,
    },
    // The unique identifier of the dataset from its source (e.g., Hugging Face dataset ID).
    datasetId: {
      type: String,
      required: [true, 'Dataset ID is required.'],
      trim: true,
      index: true,
    },
    // Metadata from the source, useful for prioritization or display.
    downloads: {
      type: Number,
      default: 0,
      min: 0,
      index: true, // Indexed for potential sorting/prioritization by popularity.
    },
    likes: {
      type: Number,
      default: 0,
      min: 0,
    },
    license: {
      type: String,
      default: '',
      trim: true,
      index: true, // Indexed for filtering datasets by license.
    },
    // The current state of the dataset in the processing pipeline.
    status: {
      type: String,
      enum: ['pending', 'downloading', 'completed', 'failed', 'skipped'],
      default: 'pending',
      index: true, // Crucial for worker processes to query for jobs.
    },
    // Job priority, allowing higher-tier workspaces (based on subscription) to have their jobs processed sooner.
    // A lower number signifies a higher priority. This is a key field for subscription management.
    priority: {
      type: Number,
      default: 10, // A default priority, can be overridden based on workspace subscription plan.
      index: true, // Essential for the worker query to fetch high-priority jobs first.
    },
    // Tracks the number of processing attempts for a job.
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Size of the dataset in bytes. Critical for storage limit calculations and usage-based billing.
    sizeBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Reason for why a dataset was intentionally not processed.
    skipReason: {
      type: String,
      default: '',
      trim: true,
    },
    // Stores the error message if processing fails.
    error: {
      type: String,
      default: '',
      trim: true,
    },
    // Timestamp of the last processing attempt. Useful for identifying stale jobs.
    lastAttemptedAt: {
      type: Date,
      default: null,
    },
    // Timestamp when the job processing was fully completed.
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    // Automatically add createdAt and updatedAt timestamps.
    timestamps: true,
    // Use a more descriptive collection name.
    collection: 'datasetQueue',
  }
);

// Compound index to ensure a dataset is queued only once per workspace.
DatasetQueueSchema.index({ workspaceId: 1, datasetId: 1 }, { unique: true });

// Compound index to help worker processes efficiently find pending or failed jobs.
// It prioritizes jobs by the 'priority' field (ascending), then processes older jobs first (FIFO within the same priority level).
// This is critical for implementing tiered subscription plans where premium users get faster processing.
DatasetQueueSchema.index({ status: 1, priority: 1, createdAt: 1 });

// Check if the model is already compiled to prevent OverwriteModelError in development/HMR environments.
const DatasetQueue = mongoose.models.DatasetQueue || mongoose.model('DatasetQueue', DatasetQueueSchema);

export default DatasetQueue;