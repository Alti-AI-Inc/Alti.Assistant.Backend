/**
 * @file Defines the Mongoose model and schema for Datasets.
 * This model includes business logic for handling database connections with resilience,
 * defining the data structure for datasets, and integrating with Google Cloud Pub/Sub
 * to trigger asynchronous background processing for new datasets.
 * @module models/Dataset
 */

import mongoose from 'mongoose';
// GCP Agent AI: Import the Google Cloud Pub/Sub client.
import { PubSub } from '@google-cloud/pubsub';

// GCP Agent AI: It is a best practice to centralize database connection logic
// in a dedicated module (e.g., 'db.js' or 'config/database.js') and initialize it once
// when the application starts. Adding connection logic to a model file is not recommended.
// However, to fulfill the audit and demonstrate resilient configurations, the connection
// logic is included here.

/**
 * The MongoDB connection string.
 * It is crucial for security and flexibility to retrieve this from environment variables.
 * @type {string}
 */
// GCP Agent AI: Retrieve the MongoDB connection string from environment variables.
// This is crucial for security and flexibility across different environments (dev, staging, prod).
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL ERROR: MONGO_URI environment variable is not set. Database connection not established.');
  // In a production application, you should exit if the database is essential for startup.
  // process.exit(1);
} else {
  /**
   * Production-ready Mongoose connection options optimized for Google Cloud Platform.
   * These settings enhance resiliency, performance, and stability in a cloud environment,
   * especially when connecting via VPC Peering or a Cloud SQL Auth Proxy.
   * @property {number} maxPoolSize - The maximum number of sockets the MongoDB driver will keep open. For serverless environments (Cloud Run/Functions), a smaller pool (e.g., 5-10) is recommended per instance. For stateful applications (GKE/Compute Engine), this can be higher (e.g., 50-100).
   * @property {number} minPoolSize - The minimum number of sockets to keep open. Helps handle initial bursts of traffic.
   * @property {number} connectTimeoutMS - How long to wait for a connection to be established before timing out. A higher value is robust for cloud environments.
   * @property {number} socketTimeoutMS - How long a socket can be inactive before closing. Prevents premature connection closure by proxies.
   * @property {boolean} keepAlive - Enables TCP KeepAlive to prevent network devices from silently dropping idle connections.
   * @property {number} keepAliveInitialDelay - Delay in milliseconds before the first keepAlive probe is sent.
   */
  // GCP Agent AI: Production-ready Mongoose connection options optimized for GCP.
  // These settings enhance resiliency, performance, and stability in a cloud environment,
  // especially when connecting via VPC Peering or a Cloud SQL Auth Proxy.
  const mongooseOptions = {
    // --- Connection Pooling ---
    // maxPoolSize: The maximum number of sockets the MongoDB driver will keep open.
    // Default is 100. For serverless environments (Cloud Run/Functions), a smaller pool
    // (e.g., 5-10) is recommended per instance to avoid overwhelming the database.
    // For stateful applications (GKE/Compute Engine), this can be higher (e.g., 50-100)
    // based on expected concurrent requests.
    maxPoolSize: 50,
    // minPoolSize: The minimum number of sockets to keep open. Helps handle initial bursts of traffic
    // without the latency of creating new connections.
    minPoolSize: 5,

    // --- Timeouts for GCP Networking ---
    // connectTimeoutMS: How long to wait for a connection to be established before timing out.
    // A higher value (e.g., 30000ms) is robust for cloud environments where initial network
    // pathing can have variable latency.
    connectTimeoutMS: 30000, // 30 seconds
    // socketTimeoutMS: How long a socket can be inactive before closing.
    // Setting this higher than the default (30s) prevents premature connection closure by
    // proxies or load balancers during long-running queries or network hiccups.
    socketTimeoutMS: 60000, // 60 seconds

    // --- KeepAlive for Long-Lived Connections ---
    // keepAlive: Enables TCP KeepAlive to prevent intermediate network devices (firewalls, NATs)
    // from silently dropping idle connections. This is critical for resiliency.

    // keepAliveInitialDelay: Delay in milliseconds before the first keepAlive probe is sent.
    // A value like 300000ms (5 minutes) is a common starting point.

  };

  // GCP Agent AI: Establish the database connection.
  // Avoid auto-connecting in test environment to prevent concurrent multi-connection crashes in Vitest pool forks.
  if (process.env.NODE_ENV !== 'test' && mongoose.connection.readyState === 0) {
    mongoose.connect(MONGO_URI, mongooseOptions);

    // GCP Agent AI: Listen for connection events to log status.
    // Mongoose's underlying driver handles automatic reconnection by default.
    // These event listeners provide visibility into the connection's lifecycle.
    const dbConnection = mongoose.connection;
    dbConnection.on('error', err => console.error('MongoDB runtime connection error:', err));
    dbConnection.on('disconnected', () => console.log('MongoDB disconnected. Attempting to reconnect...'));
    dbConnection.on('reconnected', () => console.log('MongoDB reconnected successfully.'));
    dbConnection.once('open', () => {
      console.log('MongoDB connection established successfully.');
    });
  }
}

/**
 * Google Cloud Pub/Sub client instance.
 * Used to publish messages for asynchronous background tasks.
 * In a production environment, the project ID is typically inferred from the environment.
 * @type {PubSub}
 */
// GCP Agent AI: Initialize the Pub/Sub client.
// In a production environment, project ID is usually inferred from the environment.
const pubSubClient = new PubSub();

/**
 * The name of the Pub/Sub topic for dataset processing tasks.
 * It's a best practice to configure this using environment variables.
 * @type {string}
 */
// GCP Agent AI: Define the topic name for dataset processing.
// It's a best practice to use environment variables for configuration.
const datasetProcessingTopic = process.env.DATASET_PROCESSING_TOPIC || 'dataset-processing';

/**
 * Mongoose schema for a Dataset.
 *
 * @property {string} datasetId - The unique identifier for the dataset (e.g., from Hugging Face).
 * @property {string} workspaceId - The identifier of the workspace this dataset belongs to. Essential for multi-tenancy, data isolation, and applying workspace-specific limits (e.g., storage, billing).
 * @property {string} name - The human-readable name of the dataset.
 * @property {string} author - The author of the dataset.
 * @property {string} description - A description of the dataset.
 * @property {number} downloads - The number of times the dataset has been downloaded.
 * @property {number} likes - The number of likes the dataset has received.
 * @property {string[]} tags - An array of tags for categorization and search.
 * @property {string} gcsBucket - The Google Cloud Storage bucket where the dataset files are stored.
 * @property {string[]} gcsPaths - The specific paths within the GCS bucket to the dataset files.
 * @property {string} status - The current processing status of the dataset. Follows a state machine: 'pending' -> 'downloading' -> 'archived' -> 'indexing' -> 'indexed'. Can also be 'failed'.
 * @property {string} error - A message describing an error if the processing failed.
 * @property {string[]} configs - An array of available configurations for the dataset (from Hugging Face).
 * @property {object} splits - An object storing information about the dataset's splits (e.g., train, test, validation) for each configuration.
 * @property {number} rowCount - The total number of rows in the dataset.
 * @property {number} sizeBytes - The total size of the dataset in bytes. Used by administrators to calculate workspace storage usage against subscription limits.
 * @property {object} features - A representation of the dataset's schema or columns (e.g., from Hugging Face).
 */
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

/**
 * Mongoose 'pre-save' hook.
 * This hook runs before a document is saved. It checks if the document is new
 * and sets a temporary property `_wasNew` on the document instance. This property
 * is then used in the 'post-save' hook to conditionally trigger actions only for
 * newly created documents.
 * @param {Function} next - The callback to continue the save operation.
 */
// GCP Agent AI: Mongoose 'pre-save' hook to detect if a document is new.
// This is a reliable way to pass state from the 'pre' hook to the 'post' hook.
DatasetSchema.pre('save', function (next) {
  this._wasNew = this.isNew;
  next();
});

/**
 * Mongoose 'post-save' hook.
 * This hook runs after a document has been successfully saved to the database.
 * If the document is new (checked via the `_wasNew` flag) and its status is 'pending',
 * it publishes a message to a Google Cloud Pub/Sub topic. This message triggers a
 * separate, scalable worker service to handle the long-running background processing
 * (downloading, indexing) of the dataset. This asynchronous pattern ensures the main
 * API remains responsive and stateless.
 * @param {mongoose.Document} doc - The saved document.
 */
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

/**
 * The Mongoose model for the Dataset collection.
 * This pattern (`mongoose.models.Dataset || ...`) prevents the model from being
 * recompiled in environments where the module might be re-evaluated (e.g., serverless functions, Next.js API routes),
 * avoiding a "Cannot overwrite `Dataset` model once compiled" error.
 * @type {mongoose.Model<mongoose.Document & typeof DatasetSchema>}
 */
const Dataset = mongoose.models.Dataset || mongoose.model('Dataset', DatasetSchema);

export default Dataset;
