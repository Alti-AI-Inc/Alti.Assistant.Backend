import mongoose from 'mongoose';
// GCP Agent AI: Import the Google Cloud Pub/Sub client.
// This allows us to asynchronously trigger workflow processing,
// ensuring the main application thread is not blocked and the system is scalable.
import { PubSub } from '@google-cloud/pubsub';

// GCP Agent AI: Initialize the Pub/Sub client.
// It's a good practice to initialize it once and reuse the client instance.
const pubSubClient = new PubSub();

// GCP Agent AI: Define the Pub/Sub topic name.
// Using an environment variable makes the configuration flexible across different environments (dev, staging, prod).
const WORKFLOW_EXECUTION_TOPIC = process.env.WORKFLOW_EXECUTION_TOPIC || 'workflow-execution-events';

const WorkflowExecutionStepSchema = new mongoose.Schema({
  stepId: String,
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
    default: 'pending',
  },
  startTime: Date,
  endTime: Date,
  duration: Number, // in milliseconds
  result: Object,
  error: {
    message: String,
    stack: String,
    code: String,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
});

const WorkflowExecutionSchema = new mongoose.Schema(
  {
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true,
      index: true,
    },
    // HIERARCHY & SECURITY FIX: Added workspaceId to enforce tenant boundaries.
    // Every execution must be associated with a workspace to prevent data leakage
    // and ensure that queries, usage tracking, and actions are properly scoped.
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    executionId: {
      type: String,
      required: true,
      unique: true, // `unique: true` automatically creates an index
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'awaiting_approval'],
      default: 'pending',
      index: true,
    },
    currentStepIndex: {
      type: Number,
      default: 0,
    },
    triggerType: {
      type: String,
      enum: ['schedule', 'manual', 'webhook', 'event'],
      required: true,
    },
    startTime: Date,
    endTime: Date,
    duration: Number, // in milliseconds
    steps: [WorkflowExecutionStepSchema],
    totalSteps: Number,
    completedSteps: Number,
    failedSteps: Number,
    logs: [
      {
        timestamp: {
          type: Date,
          default: Date.now,
        },
        level: {
          type: String,
          enum: ['info', 'warn', 'error', 'debug'],
          default: 'info',
        },
        message: String,
        stepId: String,
        data: Object,
      },
    ],
    result: {
      success: Boolean,
      data: Object,
      summary: String,
    },
    error: {
      message: String,
      stack: String,
      stepId: String,
    },
    context: {
      type: Object,
      default: {}, // Store execution context and variables
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    parentExecutionId: String, // For retry relationships
  },
  {
    timestamps: true,
  }
);

// GCP Agent AI: Mongoose middleware to offload workflow execution.
// This hook ensures that whenever a new workflow execution is created and saved,
// a message is published to a Pub/Sub topic. This decouples the API from the
// workflow executor, allowing for a scalable, resilient, and stateless architecture.
// A separate worker service will subscribe to this topic to process the workflows.

// Step 1: Use a 'pre' hook to check if the document is new before it's saved.
// We store this state on the document instance to access it in the 'post' hook.
WorkflowExecutionSchema.pre('save', function (next) {
  // `this.isNew` is a Mongoose boolean flag that is true if the document is new.
  this._wasNew = this.isNew;
  next();
});

// Step 2: Use a 'post' hook, which runs after the document is successfully saved to the database.
WorkflowExecutionSchema.post('save', async function (doc) {
  // We only want to trigger on the initial creation of a 'pending' or 'awaiting_approval' execution.
  // The `_wasNew` flag ensures we don't re-trigger on subsequent updates.
  const shouldTrigger = this._wasNew && ['pending', 'awaiting_approval'].includes(this.status);

  if (shouldTrigger) {
    try {
      // The message payload contains essential identifiers for the worker to fetch the full execution details.
      const messagePayload = {
        executionId: this.executionId,
        workflowId: this.workflowId.toString(),
        // INTEGRATION FIX: Pass workspaceId to the worker.
        // The worker needs this context to update workspace-level usage metrics,
        // apply limits, and ensure all subsequent operations are tenant-scoped.
        workspaceId: this.workspaceId.toString(),
        status: this.status, // Pass the status to allow workers to handle different initial states.
      };
      const dataBuffer = Buffer.from(JSON.stringify(messagePayload));

      // Publish the message to the designated Pub/Sub topic.
      const messageId = await pubSubClient.topic(WORKFLOW_EXECUTION_TOPIC).publishMessage({ data: dataBuffer });
      console.log(`[WorkflowExecution] Pub/Sub message ${messageId} published for executionId: ${this.executionId}`);
    } catch (error) {
      // Critical: If publishing fails, the workflow will not start.
      // This must be logged and monitored. A dead-letter queue or a separate
      // cleanup job could be used to find and re-trigger these failed publications.
      console.error(
        `[WorkflowExecution] FATAL: Failed to publish start event for executionId ${this.executionId}. Manual intervention may be required.`,
        error
      );
      // We do not throw an error here, as the document has already been saved.
      // Throwing would not roll back the save and could crash the server process.
    }
  }
});

// Indexes for efficient querying in a multi-tenant environment.
// Most queries should be scoped by workspaceId to ensure data isolation and prevent IDOR.

// For fetching executions for a specific workflow within a workspace.
WorkflowExecutionSchema.index({ workspaceId: 1, workflowId: 1, createdAt: -1 });

// For fetching a user's executions within a workspace, often filtered by status.
WorkflowExecutionSchema.index({ workspaceId: 1, userId: 1, status: 1, createdAt: -1 });

// For workspace-level dashboards, showing executions by status (e.g., running, failed).
WorkflowExecutionSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

// For worker services that may need to pull pending jobs across all workspaces.
// This is one of the few queries that should not be scoped by workspace.
WorkflowExecutionSchema.index({ status: 1, createdAt: -1 });

// OPTIMIZATION: The `unique: true` option on the `executionId` field already creates a unique index.
// Redundant or insecure indexes (e.g., `{ userId: 1, ... }` without `workspaceId`) have been removed
// to encourage secure, tenant-scoped querying patterns throughout the application.

// Check if model is already compiled to prevent OverwriteModelError
const WorkflowExecution =
  mongoose.models.WorkflowExecution ||
  mongoose.model('WorkflowExecution', WorkflowExecutionSchema);

export default WorkflowExecution;