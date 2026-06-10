import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';

// --- Resilient Database Connection for GCP ---
// This function establishes a connection to MongoDB with settings optimized for
// resiliency and performance in a Google Cloud Platform environment.
// It should ideally be in a dedicated file (e.g., /config/db.js or /src/db.js)
// and called once when your application initializes.
export const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    console.error('[FATAL] MONGO_URI environment variable is not set. Application cannot start.');
    process.exit(1);
  }

  const options = {
    // --- Connection Pooling ---
    // Set the maximum number of connections in the connection pool.
    // A value of 10-20 is a good starting point for stateful applications (GKE, GCE).
    // For serverless (Cloud Run/Functions), a smaller pool (e.g., 5) is often better
    // to prevent overwhelming the database with connections from many concurrent instances.
    // This should be tuned based on application load and monitoring.
    poolSize: parseInt(process.env.MONGO_POOL_SIZE || '10', 10),

    // --- Timeouts for GCP Networking ---
    // How long the driver will wait for a connection to be established before timing out.
    // 30000ms (30 seconds) is a robust value for cloud environments where initial
    // connection latency can be variable.
    connectTimeoutMS: 30000,

    // How long a socket can remain idle before being closed. This is critical for
    // environments with firewalls or load balancers (like GCP, or the Cloud SQL Auth Proxy)
    // that may silently drop idle TCP connections. This helps proactively manage stale sockets.
    socketTimeoutMS: 60000,

    // --- TCP KeepAlive for Resiliency ---
    // Enable TCP KeepAlive to send probes on idle sockets. This prevents network
    // infrastructure from considering the connection stale and dropping it.
    // This is highly recommended for long-running applications and resilient connections in GCP.
    keepAlive: true,

    // Delay in milliseconds between when the socket becomes idle and when the first
    // keep-alive probe is sent. 30000ms (30 seconds) is a good starting point.
    keepAliveInitialDelay: 30000,

    // Note: In Mongoose 6+ (and the underlying modern Node.js MongoDB driver),
    // automatic reconnection is handled by default and is part of the core topology
    // management. The `autoReconnect` option is deprecated. The settings above,
    // especially `keepAlive` and `socketTimeoutMS`, support this robust reconnect strategy.
  };

  // --- Mongoose Connection Event Listeners for Observability ---
  mongoose.connection.on('connected', () => {
    console.log(`[INFO] Mongoose connected to database.`);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[ERROR] Mongoose connection error: ${err}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[WARN] Mongoose disconnected from database. The driver will attempt to reconnect.');
  });

  // --- Initial Connection Logic ---
  try {
    await mongoose.connect(mongoURI, options);
  } catch (err) {
    console.error(`[FATAL] Initial database connection failed: ${err.message}`);
    // If the initial connection fails, the application cannot run.
    // In a containerized environment (like GKE or Cloud Run), the orchestrator
    // will restart the container, which will automatically retry the connection.
    process.exit(1);
  }
};


// It's a best practice to create one client and reuse it across the application.
// Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set or you are
// running in a GCP environment with appropriate service account permissions.
const pubSubClient = new PubSub();

// The name of the Pub/Sub topic to which usage logs will be published.
// It's recommended to configure this via environment variables.
const usageLogTopicName = process.env.USAGE_LOG_TOPIC || 'usage-log-events';

// Allows disabling Pub/Sub for local development or specific environments.
const pubSubEnabled = process.env.PUBSUB_ENABLED === 'true';

/**
 * Usage Log Model Schema
 * Tracks API usage, performance, and resource consumption for billing, limits, and analytics.
 */
const UsageLogSchema = new mongoose.Schema(
  {
    // Request Context
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      sparse: true, // Allow null for non-tenant requests
    },

    // Request Details
    module: {
      type: String,
      required: true,
      index: true,
      enum: [
        'auth',
        'tenant',
        'legal-contract',
        'legal-contract-review',
        'document-review',
        'document-analysis',
        'document-drafting',
        'knowledge-bank',
        'code-generation',
        'search',
        'deep-research',
        'presentation',
        'report-generation',
        'article-writer',
        'creative-writing',
        'rewrite',
        'translation',
        'transcription',
        'brainstorm',
        'plan-generator',
        'image-generation',
        'stripe',
        'other',
      ],
    },
    action: {
      type: String,
      required: true,
      // Examples: 'generate', 'analyze', 'search', 'create', 'update', 'delete'
    },
    endpoint: {
      type: String,
      required: true,
      // Example: '/api/v1/legal-contract/generate'
    },
    method: {
      type: String,
      required: true,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },

    // Performance Metrics
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number, // milliseconds
      required: true,
      index: true,
    },

    // Status & Results
    status: {
      type: String,
      required: true,
      enum: ['success', 'error', 'partial'],
      index: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
      // HTTP status codes: 200, 400, 500, etc.
    },
    errorType: {
      type: String,
      enum: [
        'validation',
        'authentication',
        'authorization',
        'rate-limit',
        'server',
        'external-service',
        'timeout',
        'not-found',
        null,
      ],
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
      // Brief, sanitized error description (no PII)
    },

    // Resource Usage & Costing
    tokensUsed: {
      type: Number,
      default: 0,
      min: 0, // Ensure non-negative
      // AI tokens consumed in this request
    },
    modelUsed: {
      type: String,
      default: null,
      // Example: 'gpt-4-turbo', 'claude-3-opus', 'gemini-1.5-pro'
    },
    cost: {
      type: Number,
      default: 0,
      min: 0, // Cost cannot be negative
      // Calculated monetary cost for the operation (e.g., in micro-units like 1/1,000,000th of a dollar for precision)
    },
    creditType: {
      type: String,
      enum: ['paid', 'free_trial', 'bonus', 'internal'],
      default: 'paid',
      index: true,
      // Categorizes usage for billing against different credit pools
    },
    inputSize: {
      type: Number,
      default: 0,
      // Request payload size in bytes
    },
    outputSize: {
      type: Number,
      default: 0,
      // Response payload size in bytes
    },

    // Request Context
    requestId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // UUID for tracing
    },
    ipAddress: {
      type: String,
      default: null,
      // Hashed or anonymized for privacy
    },
    userAgent: {
      type: String,
      default: null,
      // Browser/client info
    },

    // Flexible metadata for module-specific data
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // Examples:
      // { documentType: 'contract', pages: 12 }
      // { searchQuery: 'legal terms', resultsCount: 25 }
      // { fileType: 'pdf', fileSize: 2048000 }
    },
  },
  {
    timestamps: false, // Using custom timestamp field
    collection: 'usagelogs',
  }
);

// Compound Indexes for common queries
UsageLogSchema.index({ tenantId: 1, timestamp: -1 }); // Tenant usage over time
UsageLogSchema.index({ userId: 1, timestamp: -1 }); // User activity history
UsageLogSchema.index({ module: 1, timestamp: -1 }); // Module popularity
UsageLogSchema.index({ status: 1, timestamp: -1 }); // Error tracking
UsageLogSchema.index({ tenantId: 1, module: 1, timestamp: -1 }); // Tenant module usage
UsageLogSchema.index({ tenantId: 1, creditType: 1, timestamp: -1 }); // Tenant billing queries

// TTL Index - Auto-delete logs older than a configurable period (e.g., 180 days for billing records).
// Ensure this retention period aligns with your data retention policy and financial auditing requirements.
const ttlInDays = parseInt(process.env.USAGE_LOG_TTL_DAYS || '180', 10);
UsageLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: ttlInDays * 24 * 60 * 60 }
);

/**
 * Asynchronously logs usage data by publishing it to a Google Cloud Pub/Sub topic.
 * This offloads the database write from the request-response cycle, improving API performance and resilience.
 * A separate worker service (e.g., a Cloud Function) subscribes to the topic to handle database insertion.
 *
 * If Pub/Sub is disabled via `PUBSUB_ENABLED` env var, it will log to the console in non-production environments
 * for development visibility and do nothing in production.
 *
 * @param {object} logData The usage data to log.
 */
UsageLogSchema.statics.logAsync = async function (logData) {
  if (!pubSubEnabled) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[INFO] Pub/Sub disabled. Usage log data:',
        JSON.stringify(logData, null, 2)
      );
    }
    return;
  }

  try {
    const dataBuffer = Buffer.from(JSON.stringify(logData));
    await pubSubClient.topic(usageLogTopicName).publishMessage({
      data: dataBuffer,
    });
  } catch (error) {
    // If publishing fails, it's a critical issue that needs to be logged and monitored.
    // This indicates a problem with Pub/Sub configuration, permissions, or connectivity.
    // In a production environment, this should trigger an alert.
    console.error(
      `[FATAL] Failed to publish usage log to Pub/Sub topic ${usageLogTopicName}:`,
      error
    );
  }
};

/**
 * Generates a detailed usage and cost summary for a given tenant within a date range.
 * This is the primary data source for customer-facing billing dashboards and invoices.
 *
 * @param {string|mongoose.Types.ObjectId} tenantId The ID of the tenant.
 * @param {Date} startDate The start of the reporting period.
 * @param {Date} endDate The end of the reporting period.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of usage summary objects.
 */
UsageLogSchema.statics.getTenantUsageSummary = async function (
  tenantId,
  startDate,
  endDate
) {
  return this.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      // Group by both module and credit type for a detailed breakdown
      $group: {
        _id: { module: '$module', creditType: '$creditType' },
        totalRequests: { $sum: 1 },
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
        },
        errorCount: {
          $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
        },
        avgDuration: { $avg: '$duration' },
        totalTokens: { $sum: '$tokensUsed' },
        totalCost: { $sum: '$cost' }, // Sum the new cost field
      },
    },
    {
      $project: {
        _id: 0, // Exclude the default _id field
        module: '$_id.module',
        creditType: '$_id.creditType',
        totalRequests: 1,
        successCount: 1,
        errorCount: 1,
        // Safely calculate success rate, avoiding division by zero
        successRate: {
          $cond: {
            if: { $gt: ['$totalRequests', 0] },
            then: {
              $multiply: [
                { $divide: ['$successCount', '$totalRequests'] },
                100,
              ],
            },
            else: 0,
          },
        },
        avgDuration: { $round: ['$avgDuration', 2] },
        totalTokens: 1,
        totalCost: 1, // Include total cost in the final output
      },
    },
    {
      // Sort the results for consistent ordering
      $sort: { module: 1, creditType: 1 },
    },
  ]);
};

/**
 * Generates a usage summary for a specific user within a date range.
 * Useful for internal admin dashboards to track individual user activity.
 *
 * @param {string|mongoose.Types.ObjectId} userId The ID of the user.
 * @param {Date} startDate The start of the reporting period.
 * @param {Date} endDate The end of the reporting period.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of usage summary objects.
 */
UsageLogSchema.statics.getUserUsageSummary = async function (
  userId,
  startDate,
  endDate
) {
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: '$module',
        totalRequests: { $sum: 1 },
        totalTokens: { $sum: '$tokensUsed' },
        totalCost: { $sum: '$cost' },
        avgDuration: { $avg: '$duration' },
      },
    },
    {
      $project: {
        _id: 0,
        module: '$_id',
        totalRequests: 1,
        totalTokens: 1,
        totalCost: 1,
        avgDuration: { $round: ['$avgDuration', 2] },
      },
    },
    {
      $sort: { totalRequests: -1 },
    },
  ]);
};

const UsageLog = mongoose.model('UsageLog', UsageLogSchema);

export default UsageLog;