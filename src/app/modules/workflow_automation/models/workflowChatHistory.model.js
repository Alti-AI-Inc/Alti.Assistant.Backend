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
    default: {},
  },
});

/**
 * @typedef {object} WorkflowChatHistoryMetadata
 * @property {string} [userIntent] - The detected intent of the user's initial query.
 * @property {object} [extractedEntities] - Key-value pairs of entities extracted from the conversation.
 * @property {string[]} [detectedApps] - List of applications detected or involved in the workflow.
 * @property {string} [workflowType] - The type of workflow initiated (e.g., 'task_automation', 'information_retrieval').
 * @property {string} [complexity] - An indicator of the complexity of the workflow (e.g., 'simple', 'medium', 'complex').
 */

/**
 * @typedef {object} WorkflowChatHistory
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
 * This schema tracks messages, associated workflows, context, and metadata for each conversation.
 */
const WorkflowChatHistorySchema = new mongoose.Schema(
  {
    /**
     * The ID of the user who owns this chat history.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     * @index
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /**
     * A unique identifier for the conversation.
     * @type {string}
     * @required
     * @unique
     * @index
     */
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
      default: {}, // Store conversation context and state
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
     * @type {Date}
     * @default Date.now
     */
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    /**
     * Structured metadata about the conversation.
     * @type {WorkflowChatHistoryMetadata}
     */
    metadata: {
      /**
       * The detected intent of the user's initial query.
       * @type {string}
       */
      userIntent: String,
      /**
       * Key-value pairs of entities extracted from the conversation.
       * @type {object}
       */
      extractedEntities: Object,
      /**
       * List of applications detected or involved in the workflow.
       * @type {string[]}
       */
      detectedApps: [String],
      /**
       * The type of workflow initiated (e.g., 'task_automation', 'information_retrieval').
       * @type {string}
       */
      workflowType: String,
      /**
       * An indicator of the complexity of the workflow (e.g., 'simple', 'medium', 'complex').
       * @type {string}
       */
      complexity: String,
    },
  },
  {
    /**
     * Automatically adds `createdAt` and `updatedAt` timestamps to the document.
     */
    timestamps: true,
  }
);

// Indexes for efficient querying
/**
 * Index for querying chat histories by user and sorting by last activity.
 * @index
 */
WorkflowChatHistorySchema.index({ userId: 1, lastActivity: -1 });
/**
 * Index for querying chat histories by conversation ID.
 * @index
 */
WorkflowChatHistorySchema.index({ conversationId: 1 });
/**
 * Index for querying chat histories by user and status.
 * @index
 */
WorkflowChatHistorySchema.index({ userId: 1, status: 1 });

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