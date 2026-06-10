import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';

// Instantiate a new Pub/Sub client.
// It's a best practice to create one client and reuse it across the application.
// Ensure GOOGLE_APPLICATION_CREDENTIALS environment variable is set or you are
// running in a GCP environment with appropriate service account permissions.
const pubSubClient = new PubSub();

// The name of the Pub/Sub topic to which usage logs will be published.
// It's recommended to configure this via environment variables.
const usageLogTopicName = process.env.USAGE_LOG_TOPIC || 'usage-log-events';

/**
 * Usage Log Model Schema
 * Tracks API usage, performance, and resource consumption
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

    // Resource Usage (AI/ML specific)
    tokensUsed: {
      type: Number,
      default: 0,
      // AI tokens consumed in this request
    },
    modelUsed: {
      type: String,
      default: null,
      // Example: 'gpt-4', 'claude-sonnet-4', 'gemini-pro'
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

// TTL Index - Auto-delete logs older than 90 days
UsageLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

// Static method to create log asynchronously by publishing to a Pub/Sub topic.
// This offloads the database write from the request-response cycle, ensuring
// durability and scalability. A separate worker service (e.g., a Cloud Function)
// will subscribe to the topic and handle the database insertion.
UsageLogSchema.statics.logAsync = async function (logData) {
  try {
    // The data for a Pub/Sub message must be a Buffer.
    const dataBuffer = Buffer.from(JSON.stringify(logData));

    // Publish the message to the configured GCP Pub/Sub topic.
    // This is a "fire-and-forget" operation from the perspective of the caller.
    // The actual publishing is awaited here to handle potential errors, but the
    // calling service does not need to await this static method.
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

// Static method to get tenant usage summary
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
      $group: {
        _id: '$module',
        totalRequests: { $sum: 1 },
        successCount: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
        },
        errorCount: {
          $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
        },
        avgDuration: { $avg: '$duration' },
        totalTokens: { $sum: '$tokensUsed' },
      },
    },
    {
      $project: {
        module: '$_id',
        totalRequests: 1,
        successCount: 1,
        errorCount: 1,
        successRate: {
          $multiply: [{ $divide: ['$successCount', '$totalRequests'] }, 100],
        },
        avgDuration: { $round: ['$avgDuration', 2] },
        totalTokens: 1,
      },
    },
  ]);
};

// Static method to get user usage summary
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
        count: { $sum: 1 },
        totalTokens: { $sum: '$tokensUsed' },
        avgDuration: { $avg: '$duration' },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);
};

const UsageLog = mongoose.model('UsageLog', UsageLogSchema);

export default UsageLog;