/**
 * @file Defines the Mongoose schemas and model for storing workflow chat history.
 * @module models/workflowChatHistory
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} ChatMessage
 * @property {'user'|'assistant'|'system'} role - The role of the sender of the message.
 * @property {string} content - The actual text content of the message.
 * @property {Date} [timestamp] - The timestamp when the message was created. Defaults to current time.
 * @property {object} [metadata] - Additional metadata associated with the message. Defaults to an empty object.
 */
/**
 * Mongoose Schema for a single chat message within a conversation.
 * Represents a message sent by a user, assistant, or system.
 */
const ChatMessageSchema = new mongoose.Schema({
  /**
   * The role of the sender of the message.
   * @type {('user'|'assistant'|'system')}
   * @required
   */
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  /**
   * The actual text content of the message.
   * @type {string}
   * @required
   */
  content: {
    type: String,
    required: true,
    trim: true, // Trim whitespace from content
  },
  /**
   * The timestamp when the message was created.
   * @type {Date}
   * @default Date.now
   */
  timestamp: {
    type: Date,
    default: Date.now,
  },
  /**
   * Additional metadata associated with the message.
   * @type {object}
   * @default {}
   */
  metadata: {
    type: Object,
    default: () => ({}), // Use a function for the default to prevent sharing the same object reference
  },
});

/**
 * @typedef {object} WorkflowChatHistoryMetadata
 * @property {string} [userIntent] - The detected intent of the user's initial query.
 * @property {Map<string, any>} [extractedEntities] - Key-value pairs of entities extracted from the conversation.
 * @property {string[]} [detectedApps] - List of applications detected or involved in the workflow.
 * @property {string} [workflowType] - The type of workflow initiated (e.g., 'task_automation', 'information_retrieval').
 * @property {'simple'|'medium'|'complex'|'unknown'} [complexity] - An indicator of the complexity of the workflow.
 */

/**
 * @typedef {object} WorkflowChatHistory
 * @property {mongoose.Types.ObjectId} workspaceId - The ID of the workspace this chat history belongs to.
 * @property {mongoose.Types.ObjectId} userId - The ID of the user who owns this chat history.
 * @property {string} conversationId - A unique identifier for the conversation.
 * @property {string} [title] - A user-friendly title for the conversation.
 * @property {ChatMessage[]} messages - An array of chat messages in chronological order.
 * @property {mongoose.Types.ObjectId[]} [workflowIds] - An array of IDs of workflows associated with this conversation.
 * @property {object} [context] - Stores conversation context and state, useful for multi-turn interactions.
 * @property {('active'|'completed'|'archived')} [status] - The current status of the conversation.
 * @property {Date} [lastActivity] - The timestamp of the last activity in the conversation.
 * @property {WorkflowChatHistoryMetadata} [metadata] - Structured metadata about the conversation.
 * @property {Date} [createdAt] - The timestamp when the document was created.
 * @property {Date} [updatedAt] - The timestamp when the document was last updated.
 */
/**
 * Mongoose Schema for storing the history of a workflow-driven chat conversation.
 * This schema tracks messages, associated workflows, context, and metadata for each conversation,
 * and is linked to a workspace for billing and limit management.
 */
const WorkflowChatHistorySchema = new mongoose.Schema(
  {
    /**
     * The ID of the workspace this chat history belongs to.
     * Essential for multi-tenancy, billing, and applying limits.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Workspace
     * @required
     * @index
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    /**
     * The ID of the user who owns this chat history.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /**
     * A unique identifier for the conversation.
     * @type {string}
     * @required
     * @unique
     */
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true, // A unique index is automatically created, but explicit is fine.
    },
    /**
     * A user-friendly title for the conversation.
     * @type {string}
     * @trim
     */
    title: {
      type: String,
      trim: true,
    },
    /**
     * An array of chat messages in chronological order.
     * @type {ChatMessage[]}
     */
    messages: [ChatMessageSchema],
    /**
     * An array of IDs of workflows associated with this conversation.
     * @type {mongoose.Schema.Types.ObjectId[]}
     * @ref Workflow
     */
    workflowIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workflow',
      },
    ],
    /**
     * Stores conversation context and state, useful for multi-turn interactions.
     * @type {object}
     * @default {}
     */
    context: {
      type: Object,
      default: () => ({}), // Use a function for the default to prevent sharing the same object reference
    },
    /**
     * The current status of the conversation.
     * @type {('active'|'completed'|'archived')}
     * @default 'active'
     */
    status: {
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    },
    /**
     * The timestamp of the last activity in the conversation.
     * This is automatically updated by the `timestamps` option.
     * @type {Date}
     */
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    /**
     * Structured metadata about the conversation for analytics and improved processing.
     * @type {WorkflowChatHistoryMetadata}
     */
    metadata: {
      type: {
        userIntent: { type: String, trim: true },
        extractedEntities: { type: Map, of: mongoose.Schema.Types.Mixed },
        detectedApps: [{ type: String, trim: true }],
        workflowType: { type: String, trim: true },
        complexity: {
          type: String,
          enum: ['simple', 'medium', 'complex', 'unknown'],
          default: 'unknown',
        },
      },
      default: () => ({}),
    },
  },
  {
    /**
     * Automatically adds `createdAt` and `updatedAt` timestamps to the document.
     * `updatedAt` can serve as `lastActivity`.
     */
    timestamps: true,
  }
);

// Middleware to update `lastActivity` on any save operation.
// While `timestamps.updatedAt` can be used, an explicit `lastActivity` field
// can be useful if you want to control its update logic separately in the future.
WorkflowChatHistorySchema.pre('save', function (next) {
  if (this.isModified()) {
    this.lastActivity = new Date();
  }
  next();
});

// Indexes for efficient querying, optimized for a workspace-centric architecture.
/**
 * Index for querying chat histories within a workspace, sorted by recent activity.
 * Crucial for displaying conversation lists for a workspace.
 * @index
 */
WorkflowChatHistorySchema.index({ workspaceId: 1, lastActivity: -1 });

/**
 * Compound index for filtering conversations by user and status within a workspace.
 * Supports common filtering operations in the application UI.
 * @index
 */
WorkflowChatHistorySchema.index({ workspaceId: 1, userId: 1, status: 1 });


/**
 * Represents the Mongoose model for workflow chat history.
 * This model provides an interface to the `workflowchathistories` collection in MongoDB.
 * It prevents `OverwriteModelError` by checking if the model is already compiled.
 * @type {mongoose.Model<WorkflowChatHistory>}
 */
const WorkflowChatHistory =
  mongoose.models.WorkflowChatHistory ||
  mongoose.model('WorkflowChatHistory', WorkflowChatHistorySchema);

export default WorkflowChatHistory;