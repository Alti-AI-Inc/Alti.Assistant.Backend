/**
 * @file Defines the Mongoose schema for Code Chat Sessions.
 * @module app/modules/code/model/code.model
 */

import mongoose, { Schema } from 'mongoose';

/**
 * @typedef {object} CodeChatSession
 * @property {string} thread_id - The unique identifier for the OpenAI assistant thread.
 * @property {mongoose.Types.ObjectId} user_id - The ID of the user associated with this chat session.
 * @property {Array<object>} history - An array storing the conversation history (messages, roles, content).
 * @property {mongoose.Types.ObjectId | null} tenantId - The ID of the tenant this session belongs to, or null for global sessions.
 */

/**
 * Mongoose Schema for a Code Chat Session.
 *
 * This schema defines the structure for storing chat sessions related to code generation
 * or analysis, typically involving an AI assistant. It includes references to the
 * OpenAI thread, the user, the conversation history, and supports multi-tenancy.
 *
 * @constant {mongoose.Schema<CodeChatSession>} CodeChatSessionSchema
 */
export const CodeChatSessionSchema = new mongoose.Schema({
  /**
   * The unique identifier for the OpenAI assistant thread associated with this chat session.
   * This is crucial for resuming conversations with the AI.
   * @type {string}
   * @required
   * @unique
   */
  thread_id: {
    type: String,
    required: true,
    unique: true,
  },
  /**
   * The ID of the user who initiated or owns this chat session.
   * References the 'User' model.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref User
   * @required
   */
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  /**
   * An array of mixed types representing the conversation history.
   * Each element typically contains message content, sender role, and other metadata.
   * @type {Schema.Types.Mixed}
   */
  history: {
    type: Schema.Types.Mixed,
  },

  /**
   * Multi-tenant support: The ID of the tenant this chat session belongs to.
   * If null, the session is considered global or not tenant-specific.
   * References the 'Tenant' model.
   * @type {mongoose.Schema.Types.ObjectId | null}
   * @ref Tenant
   * @default null
   * @index
   */
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});