/**
 * @file Chatbot Mongoose Model
 * @module app/modules/chatbots/chatbot.model
 * @description Defines the Mongoose schema and model for Chatbot entities.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} ChatbotSchemaDefinition
 * @property {string} name - The name of the chatbot. Required and trimmed, max 100 characters.
 * @property {string} [description=''] - A brief description of the chatbot. Trimmed.
 * @property {string} [instructions=''] - Specific instructions or system prompts for the chatbot. Trimmed.
 * @property {string} [guardrails=''] - Guardrail instructions or safety guidelines for the chatbot. Trimmed.
 * @property {string} [model='Gemini 1.5 Pro'] - The AI model used by the chatbot.
 * @property {string} [avatar='🤖'] - An emoji or URL representing the chatbot's avatar.
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who owns this chatbot. Required.
 * @property {mongoose.Schema.Types.ObjectId[]} [knowledgebaseIds=[]] - An array of IDs of knowledge bases linked to this chatbot.
 * @property {boolean} [isActive=true] - Indicates if the chatbot is active and available for use.
 * @property {number} [conversationCount=0] - Total number of conversations with this chatbot. For workspace metrics.
 * @property {number} [messageCount=0] - Total number of messages processed by this chatbot. For workspace metrics and plan limits.
 * @property {Date} [lastActivityAt=null] - Timestamp of the last interaction. For identifying active/dormant bots.
 * @property {mongoose.Schema.Types.Mixed} [metadata={}] - A flexible field for storing additional, unstructured data.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId=null] - The ID of the tenant (workspace) this chatbot belongs to. Can be null for personal chatbots.
 * @property {boolean} [isShared=false] - Indicates if the chatbot is shared across the tenant or publicly.
 */

/**
 * Mongoose Schema for the Chatbot model.
 * Defines the structure and validation rules for chatbot documents in the database.
 *
 * @type {mongoose.Schema<ChatbotSchemaDefinition>}
 */
const ChatbotSchema = new mongoose.Schema(
  {
    /**
     * The name of the chatbot.
     * @type {string}
     * @required
     * @trim
     * @maxlength 100
     */
    name: {
      type: String,
      required: [true, 'Chatbot name is required'],
      trim: true,
      maxlength: [100, 'Chatbot name cannot exceed 100 characters'],
    },
    /**
     * A brief description of the chatbot.
     * @type {string}
     * @default ''
     * @trim
     */
    description: {
      type: String,
      trim: true,
      default: '',
    },
    /**
     * Specific instructions or system prompts for the chatbot.
     * These guide the chatbot's behavior and responses.
     * @type {string}
     * @default ''
     * @trim
     */
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    /**
     * Guardrail instructions or safety guidelines for the chatbot.
     * These define boundaries for the chatbot's responses.
     * @type {string}
     * @default ''
     * @trim
     */
    guardrails: {
      type: String,
      trim: true,
      default: '',
    },
    /**
     * The AI model used by the chatbot (e.g., 'Gemini 1.5 Pro').
     * @type {string}
     * @default 'Gemini 1.5 Pro'
     */
    model: {
      type: String,
      default: 'Gemini 1.5 Pro',
    },
    /**
     * An emoji or URL representing the chatbot's avatar.
     * @type {string}
     * @default '🤖'
     */
    avatar: {
      type: String,
      default: '🤖',
    },
    /**
     * The ID of the user who owns this chatbot.
     * References the 'User' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref 'User'
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
     * An array of IDs of knowledge bases linked to this chatbot.
     * These knowledge bases provide context and information to the chatbot.
     * References the 'KnowledgeBase' model.
     * @type {mongoose.Schema.Types.ObjectId[]}
     * @ref 'KnowledgeBase'
     */
    knowledgebaseIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KnowledgeBase',
      },
    ],
    /**
     * Indicates if the chatbot is active and available for use.
     * @type {boolean}
     * @default true
     */
    isActive: {
      type: Boolean,
      default: true,
    },
    // START: Manager Platform Optimizations
    /**
     * The total number of conversations initiated with this chatbot.
     * Useful for manager dashboard metrics.
     * @type {number}
     * @default 0
     * @min 0
     */
    conversationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * The total number of messages processed by this chatbot.
     * Useful for manager dashboard metrics and plan limit tracking.
     * @type {number}
     * @default 0
     * @min 0
     */
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Timestamp of the last interaction with the chatbot.
     * Helps managers identify active or dormant chatbots in their workspace.
     * @type {Date}
     * @default null
     * @index
     */
    lastActivityAt: {
      type: Date,
      default: null,
      index: true, // Index for sorting/filtering by recent activity.
    },
    // END: Manager Platform Optimizations
    /**
     * A flexible field for storing additional, unstructured data related to the chatbot.
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    /**
     * The ID of the tenant (workspace) this chatbot belongs to.
     * This is crucial for scoping all manager-level access and features.
     * References the 'Tenant' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref 'Tenant'
     * @default null
     * @index
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    /**
     * Indicates if the chatbot is shared across the tenant or publicly.
     * @type {boolean}
     * @default false
     * @index
     */
    isShared: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
    toJSON: {
      virtuals: true, // Include virtuals when converting to JSON
      /**
       * Transforms the document before returning it as JSON.
       * Renames _id to id and removes _id and __v.
       * @param {object} doc - The original Mongoose document.
       * @param {object} ret - The plain object representation of the document.
       * @returns {object} The transformed object.
       */
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true }, // Include virtuals when converting to a plain object
  }
);

// Indexes for efficient querying
/**
 * Compound index for querying chatbots by tenant, user, and active status.
 * @index
 */
ChatbotSchema.index({ tenantId: 1, userId: 1, isActive: 1 });
/**
 * Compound index for querying shared chatbots by tenant and active status.
 * @index
 */
ChatbotSchema.index({ tenantId: 1, isShared: 1, isActive: 1 });
/**
 * Index for querying chatbots by user and active status (legacy fallback).
 * @index
 */
ChatbotSchema.index({ userId: 1, isActive: 1 }); // Legacy fallback

/**
 * Represents the Chatbot Mongoose Model.
 * Provides an interface for interacting with the 'chatbots' collection in MongoDB.
 *
 * @type {mongoose.Model<ChatbotSchemaDefinition>}
 */
const Chatbot = mongoose.model('Chatbot', ChatbotSchema);

export default Chatbot;