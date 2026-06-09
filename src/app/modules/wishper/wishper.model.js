/**
 * @file Defines the Mongoose schema and model for Wishper AI sessions.
 * @module wishperModel
 * @requires mongoose
 */

const mongoose = require('mongoose');

/**
 * @typedef {object} WishperResponse
 * @property {string} response - The AI's response to a prompt.
 * @property {string} prompt - The user's prompt that generated the AI response.
 * @property {boolean} done - Indicates if the AI response generation is complete.
 * @property {number} total_duration - The total duration in milliseconds for generating the response.
 * @property {number} load_duration - The duration in milliseconds for loading necessary resources for the response.
 * @property {Date} created_at - The timestamp when this specific response was created. Defaults to the current date.
 */

/**
 * @typedef {object} WishperSession
 * @property {mongoose.Schema.Types.ObjectId} user - The ID of the user associated with this session. References the 'User' model.
 * @property {string} [sessionId] - An optional unique identifier for the session.
 * @property {WishperResponse[]} responses - An array of objects, each representing a prompt-response pair within the session.
 * @property {Date} createdAt - The timestamp when the session was created. Defaults to the current date.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId=null] - The ID of the tenant this session belongs to. References the 'Tenant' model. Supports multi-tenancy.
 */

/**
 * Mongoose schema for a Wishper AI session.
 *
 * @type {mongoose.Schema<WishperSession>}
 */
const wishperSessionSchema = new mongoose.Schema({
  /**
   * The ID of the user associated with this session.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref User
   * @required
   */
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  /**
   * An optional unique identifier for the session.
   * Enforced as unique when present, allowing null/undefined values.
   * @type {string}
   */
  sessionId: { type: String, unique: true, sparse: true }, // Bug fix: Added unique: true and sparse: true to enforce the documented uniqueness for optional sessionId.
  /**
   * An array of objects, each representing a prompt-response pair within the session.
   * @type {WishperResponse[]}
   */
  responses: [
    {
      /**
       * The AI's response to a prompt.
       * @type {string}
       */
      response: String,
      /**
       * The user's prompt that generated the AI response.
       * @type {string}
       */
      prompt: String,
      /**
       * Indicates if the AI response generation is complete.
       * @type {boolean}
       */
      done: Boolean,
      /**
       * The total duration in milliseconds for generating the response.
       * @type {number}
       */
      total_duration: Number,
      /**
       * The duration in milliseconds for loading necessary resources for the response.
       * @type {number}
       */
      load_duration: Number,
      /**
       * The timestamp when this specific response was created.
       * @type {Date}
       * @default Date.now
       */
      created_at: { type: Date, default: Date.now },
    },
  ],
  /**
   * The timestamp when the session was created.
   * @type {Date}
   * @default Date.now
   */
  createdAt: { type: Date, default: Date.now },

  /**
   * The ID of the tenant this session belongs to. Supports multi-tenancy.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref Tenant
   * @default null
   * @index true
   */
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
});

/**
 * Mongoose model for a Wishper AI session.
 * Represents a collection of interactions (prompts and responses) with the Wishper AI for a specific user.
 *
 * @type {mongoose.Model<WishperSession>}
 */
// Bug fix: Changed model name from 'Wishper' to 'WishperAiSession' for consistency with the variable name and clearer collection naming (will be 'wishperaisessions').
const WishperAiSession = mongoose.model('WishperAiSession', wishperSessionSchema);

module.exports = WishperAiSession;