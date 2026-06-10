import mongoose from 'mongoose';
// GCP Agent AI: Import the Google Cloud Pub/Sub client.
import { PubSub } from '@google-cloud/pubsub';

// GCP Agent AI: Initialize the Pub/Sub client.
// In a production environment, project ID is usually inferred from the environment.
const pubSubClient = new PubSub();
// GCP Agent AI: Define the topic name for dataset processing.
// It's a best practice to use environment variables for configuration.
const datasetProcessingTopic = process.env.DATASET_PROCESSING_TOPIC || 'dataset-processing';

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

// GCP Agent AI: Mongoose 'pre-save' hook to detect if a document is new.
// This is a reliable way to pass state from the 'pre' hook to the 'post' hook.
DatasetSchema.pre('save', function (next) {
  this._wasNew = this.isNew;
  next();
});

// GCP Agent AI: Mongoose 'post-save' hook to offload background processing.
// The 'status' field ('downloading', 'indexing') indicates long-running tasks.
// This hook triggers after a new dataset is created, publishing a message to Pub/Sub
// to initiate the processing pipeline (download, index, etc.) in a separate, scalable worker service.
// This ensures the main API remains responsive and stateless.
DatasetSchema.post('save', async function (doc) {
  if (this._wasNew && doc.status === 'pending') {
    try {
      // The message payload contains the necessary identifiers for the worker
      // to retrieve the full dataset details from the database.
      const messagePayload = {
        datasetMongoId: doc._id.toString(),
        datasetId: doc.datasetId,
      };
      const dataBuffer = Buffer.from(JSON.stringify(messagePayload));

      // Publish the message to the designated Pub/Sub topic.
      const messageId = await pubSubClient.topic(datasetProcessingTopic).publishMessage({ data: dataBuffer });
      console.log(`[Dataset Model] Job for dataset ${doc.datasetId} published with message ID: ${messageId}`);
    } catch (error) {
      // If publishing fails, log the error. In a production system, you might also
      // update the dataset's status to 'failed' and set an error message.
      // This prevents the dataset from being stuck in a 'pending' state indefinitely.
      console.error(`[Dataset Model] Failed to publish job for dataset ${doc.datasetId}:`, error);
      // Example of error handling:
      // doc.status = 'failed';
      // doc.error = 'Failed to queue processing job.';
      // await doc.save(); // Be cautious with save() in post-hooks to avoid infinite loops.
    }
  }
});

const Dataset = mongoose.models.Dataset || mongoose.model('Dataset', DatasetSchema);

export default Dataset;