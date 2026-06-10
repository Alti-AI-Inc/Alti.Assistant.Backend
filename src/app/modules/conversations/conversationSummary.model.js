import { Schema, model } from 'mongoose';
import crypto from 'crypto';

/**
 * The encryption key used for encrypting sensitive conversation summary data.
 * This key should be a 32-character string for AES-256-CBC.
 * It is loaded from environment variables (CHAT_ENCRYPTION_KEY) or defaults to a placeholder.
 * @type {string}
 */
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 characters

/**
 * The length of the Initialization Vector (IV) in bytes, required for AES-256-CBC encryption.
 * @type {number}
 */
const IV_LENGTH = 16;

/**
 * Encrypts a given plain text string using AES-256-CBC encryption.
 * The encryption key is derived from `ENCRYPTION_KEY`.
 * The output format is `iv:encryptedText` where both are hex encoded.
 *
 * @param {string} text - The plain text string to encrypt.
 * @returns {string} The IV and encrypted text concatenated with a colon (e.g., "hexIV:hexEncryptedText"),
 *                   or the original text if encryption fails, the input is not a string, or it appears to be already encrypted.
 */
function encryptText(text) {
  if (!text || typeof text !== 'string') return text;
  // Check if already encrypted to avoid double encryption (heuristic)
  // An encrypted string is expected to be "hexIV:hexEncryptedText", where hexIV is 32 chars (16 bytes * 2)
  if (text.includes(':') && text.split(':')[0].length === 32) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    // In a production environment, consider logging the error.
    return text; // Fallback to original text if encryption fails
  }
}

/**
 * Decrypts an encrypted text string using AES-256-CBC encryption.
 * The input is expected to be in the format `iv:encryptedText` (hex encoded).
 * The decryption key is derived from `ENCRYPTION_KEY`.
 *
 * @param {string} text - The encrypted text string (e.g., "hexIV:hexEncryptedText") to decrypt.
 * @returns {string} The decrypted plain text string, or the original text if decryption fails,
 *                   the input is not a string, or it's not in the expected encrypted format.
 */
function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) return text; // Not in expected encrypted format
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    // In a production environment, consider logging the error.
    return text; // Fallback to original text if decryption fails
  }
}

/**
 * @typedef {object} MessageRange
 * @property {number} startIndex - The starting index (inclusive, 0-based) of messages included in this summary.
 * @property {number} endIndex - The ending index (inclusive, 0-based) of messages included in this summary.
 * @property {number} totalMessages - The total number of messages in the conversation at the time of summary creation.
 */

/**
 * @typedef {object} Metadata
 * @property {string[]} keyTopics - An array of key topics identified in the summarized conversation segment.
 * @property {string[]} entities - An array of entities (e.g., names, places, organizations) detected.
 * @property {string[]} detectedApps - An array of applications detected or referenced in the conversation.
 * @property {string} [summaryVersion='1.0'] - The version of the summary generation algorithm or format.
 */

/**
 * @typedef {object} ConversationSummaryType
 * @property {string} conversationId - The unique identifier of the conversation.
 * @property {string} userId - The unique identifier of the user associated with the conversation.
 * @property {string} summary - The encrypted summary text of the conversation segment.
 * @property {string} context - The encrypted contextual information related to the summary.
 * @property {MessageRange} messageRange - Details about the range of messages covered by this summary.
 * @property {number} tokenCount - The number of tokens used to generate this summary.
 * @property {Metadata} metadata - Additional metadata about the summary.
 * @property {'active' | 'archived' | 'superseded'} status - The current status of the summary.
 * @property {Date} createdAt - The timestamp when the summary was created.
 * @property {Date} updatedAt - The timestamp when the summary was last updated.
 */

/**
 * Mongoose schema for ConversationSummary.
 * Defines the structure and behavior of conversation summary documents in MongoDB.
 * Sensitive fields like `summary` and `context` are encrypted/decrypted automatically using getters and setters.
 *
 * @type {Schema<ConversationSummaryType>}
 */
const conversationSummarySchema = new Schema(
  {
    /**
     * The unique identifier of the conversation this summary belongs to.
     * @type {string}
     * @required
     * @index
     */
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * The unique identifier of the user who owns this conversation summary.
     * @type {string}
     * @required
     * @index
     */
    userId: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * The summary text of the conversation segment. Stored encrypted in the database.
     * Automatically decrypted when retrieved and encrypted when set.
     * @type {string}
     * @required
     */
    summary: {
      type: String,
      required: true,
      get: decryptText,
      set: encryptText,
    },
    /**
     * Additional contextual information related to the summary. Stored encrypted.
     * Automatically decrypted when retrieved and encrypted when set.
     * @type {string}
     * @default ''
     */
    context: {
      type: String,
      default: '',
      get: decryptText,
      set: encryptText,
    },
    /**
     * Defines the range of messages within the conversation that this summary covers.
     * @type {MessageRange}
     * @required
     */
    messageRange: {
      startIndex: {
        type: Number,
        required: true,
        description: 'The zero-based index of the first message included in this summary.',
      },
      endIndex: {
        type: Number,
        required: true,
        description: 'The zero-based index of the last message included in this summary.',
      },
      totalMessages: {
        type: Number,
        required: true,
        description: 'The total number of messages in the conversation when this summary was generated.',
      },
    },
    /**
     * The estimated number of tokens used by the language model to generate this summary.
     * @type {number}
     * @required
     */
    tokenCount: {
      type: Number,
      required: true,
    },
    /**
     * Additional metadata associated with the summary.
     * @type {Metadata}
     */
    metadata: {
      keyTopics: {
        type: [String],
        description: 'An array of key topics identified in the summarized conversation segment.',
      },
      entities: {
        type: [String],
        description: 'An array of entities (e.g., names, places, organizations) detected in the conversation.',
      },
      detectedApps: {
        type: [String],
        description: 'An array of applications detected or referenced in the conversation.',
      },
      summaryVersion: {
        type: String,
        default: '1.0',
        description: 'The version of the summary generation algorithm or format.',
      },
    },
    /**
     * The current status of the conversation summary.
     * 'active': The most current and relevant summary.
     * 'archived': An older summary kept for historical purposes.
     * 'superseded': An older summary that has been replaced by a newer 'active' one.
     * @type {'active' | 'archived' | 'superseded'}
     * @enum {string}
     * @default 'active'
     */
    status: {
      type: String,
      enum: ['active', 'archived', 'superseded'],
      default: 'active',
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    collection: 'conversation_summaries', // Specifies the MongoDB collection name
    toJSON: { getters: true }, // Apply getters when converting to JSON (e.g., decrypt summary/context)
    toObject: { getters: true }, // Apply getters when converting to a plain object
  }
);

/**
 * Compound index for efficient queries by conversation and user.
 * @index
 */
conversationSummarySchema.index({ conversationId: 1, userId: 1 });

/**
 * Compound index for efficient queries by conversation and status.
 * @index
 */
conversationSummarySchema.index({ conversationId: 1, status: 1 });

/**
 * Static method to find the most recent active conversation summary for a given conversation and user.
 *
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {import('mongoose').Query<ConversationSummaryDocument | null, ConversationSummaryDocument>}
 *          A Mongoose query that resolves to the most recent active conversation summary, or null if not found.
 */
conversationSummarySchema.statics.findActiveForConversation = function (
  conversationId,
  userId
) {
  return this.findOne({
    conversationId,
    userId,
    status: 'active',
  }).sort({ createdAt: -1 });
};

/**
 * Static method to retrieve all conversation summaries for a specific conversation and user.
 * Summaries are sorted by their message range start index in ascending order.
 *
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {import('mongoose').Query<ConversationSummaryDocument[], ConversationSummaryDocument>}
 *          A Mongoose query that resolves to an array of all conversation summaries for the given conversation and user.
 */
conversationSummarySchema.statics.getAllForConversation = function (
  conversationId,
  userId
) {
  return this.find({
    conversationId,
    userId,
  }).sort({ 'messageRange.startIndex': 1 });
};

/**
 * @typedef {import('mongoose').Document & ConversationSummaryType} ConversationSummaryDocument
 */

/**
 * @typedef {import('mongoose').Model<ConversationSummaryDocument, {}, {
 *   findActiveForConversation(conversationId: string, userId: string): import('mongoose').Query<ConversationSummaryDocument | null, ConversationSummaryDocument>;
 *   getAllForConversation(conversationId: string, userId: string): import('mongoose').Query<ConversationSummaryDocument[], ConversationSummaryDocument>;
 * }>} ConversationSummaryModel
 */

/**
 * Mongoose model for ConversationSummary.
 * Provides an interface to interact with the 'conversation_summaries' collection in MongoDB.
 *
 * @type {ConversationSummaryModel}
 */
const ConversationSummary = model(
  'ConversationSummary',
  conversationSummarySchema
);

export default ConversationSummary;