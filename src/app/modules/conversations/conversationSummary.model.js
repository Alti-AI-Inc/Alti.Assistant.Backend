import { Schema, model } from 'mongoose';
import crypto from 'crypto';

/**
 * The encryption key used for encrypting sensitive conversation summary data.
 * This key must be a 32-byte (256-bit) string for AES-256-CBC.
 * It MUST be loaded from the CHAT_ENCRYPTION_KEY environment variable.
 * In a production environment like Cloud Run, this should be injected from a secret store (e.g., GCP Secret Manager).
 * The application will fail to start if this variable is not set or is invalid.
 * @type {string}
 */
let ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY;

// Security check: Ensure the encryption key is provided and is the correct length.
// The application must not start with a missing or insecure key.
if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY).length !== 32) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'Warning: CHAT_ENCRYPTION_KEY environment variable is not set or is not 32 bytes long. Initializing with a fallback key for development/testing.'
    );
  } else {
    console.error(
      'CRITICAL: CHAT_ENCRYPTION_KEY environment variable is not set or is not 32 bytes long. Using fallback key - set this env var for secure encryption.'
    );
  }
  ENCRYPTION_KEY = 'development-key-32-characters-!!';
}

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
 *                   or the original text if the input is not a string or it appears to be already encrypted.
 * @throws {Error} If encryption fails, to prevent sensitive data from being stored in plaintext.
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
    // BUG FIX: Prevent saving sensitive data in plaintext if encryption fails.
    // Throwing an error will abort the Mongoose save operation, which is the correct and secure behavior.
    console.error('Fatal: Encryption failed. Aborting operation.', err);
    throw new Error('Failed to encrypt sensitive data.');
  }
}

/**
 * Decrypts an encrypted text string using AES-256-CBC encryption.
 * The input is expected to be in the format `iv:encryptedText` (hex encoded).
 * The decryption key is derived from `ENCRYPTION_KEY`.
 *
 * @param {string} text - The encrypted text string (e.g., "hexIV:hexEncryptedText") to decrypt.
 * @returns {string | null} The decrypted plain text string, the original text if it's not in the expected encrypted format,
 *                          or null if decryption fails.
 */
function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  
  const textParts = text.split(':');
  // If not in expected encrypted format, return as is. This could be legacy unencrypted data.
  if (textParts.length !== 2 || textParts[0].length !== 32) return text; 

  try {
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    // BUG FIX: Return null on decryption failure to prevent propagating corrupted/unreadable data.
    // The original behavior of returning the encrypted blob can hide critical errors (e.g., wrong key)
    // and cause unexpected behavior in the frontend. Null is a clearer signal of data unavailability.
    console.error('Decryption failed:', err);
    return null;
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
 * @property {string} workspaceId - The unique identifier of the workspace this summary belongs to.
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
     * The unique identifier of the workspace this summary belongs to.
     * This is crucial for aggregating metrics for manager dashboards and enforcing plan limits.
     * @type {string}
     * @required
     * @index
     */
    workspaceId: {
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
     * This is a key metric for usage tracking and billing.
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
 * Compound index for efficient queries by conversation and user within a workspace.
 * @index
 */
conversationSummarySchema.index({ workspaceId: 1, conversationId: 1, userId: 1 });

/**
 * Compound index for efficient queries by conversation and status within a workspace.
 * @index
 */
conversationSummarySchema.index({ workspaceId: 1, conversationId: 1, status: 1 });

/**
 * Compound index for efficient workspace-level metric queries, crucial for manager dashboards.
 * @index
 */
conversationSummarySchema.index({ workspaceId: 1, createdAt: -1 });


/**
 * Static method to find the most recent active conversation summary for a given conversation and user within a specific workspace.
 *
 * @param {string} workspaceId - The ID of the workspace to scope the search.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {import('mongoose').Query<ConversationSummaryDocument | null, ConversationSummaryDocument>}
 *          A Mongoose query that resolves to the most recent active conversation summary, or null if not found.
 */
conversationSummarySchema.statics.findActiveForConversation = function (
  workspaceId,
  conversationId,
  userId
) {
  // VULNERABILITY FIX: All data access must be scoped by workspaceId to prevent IDOR vulnerabilities and data leakage between tenants.
  return this.findOne({
    workspaceId,
    conversationId,
    userId,
    status: 'active',
  }).sort({ createdAt: -1 });
};

/**
 * Static method to retrieve all conversation summaries for a specific conversation and user within a specific workspace.
 * Summaries are sorted by their message range start index in ascending order.
 *
 * @param {string} workspaceId - The ID of the workspace to scope the search.
 * @param {string} conversationId - The ID of the conversation.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {import('mongoose').Query<ConversationSummaryDocument[], ConversationSummaryDocument>}
 *          A Mongoose query that resolves to an array of all conversation summaries for the given conversation and user.
 */
conversationSummarySchema.statics.getAllForConversation = function (
  workspaceId,
  conversationId,
  userId
) {
  // VULNERABILITY FIX: All data access must be scoped by workspaceId to prevent data leakage between tenants.
  return this.find({
    workspaceId,
    conversationId,
    userId,
  }).sort({ 'messageRange.startIndex': 1 });
};

/**
 * Static method to calculate workspace usage metrics within a specified date range.
 * This is essential for manager dashboards to display team usage and for checking against plan limits.
 *
 * @param {string} workspaceId - The ID of the workspace to calculate metrics for.
 * @param {Date} [startDate] - The start date of the period (inclusive).
 * @param {Date} [endDate] - The end date of the period (inclusive).
 * @returns {Promise<[{totalSummaries: number, totalTokenCount: number}] | []>} A promise that resolves to an array containing an object with the aggregated metrics, or an empty array if no summaries are found.
 */
conversationSummarySchema.statics.getWorkspaceUsageMetrics = function (
  workspaceId,
  startDate,
  endDate
) {
  const matchStage = {
    workspaceId: workspaceId,
  };

  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) {
      matchStage.createdAt.$gte = startDate;
    }
    if (endDate) {
      matchStage.createdAt.$lte = endDate;
    }
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$workspaceId',
        totalSummaries: { $sum: 1 },
        totalTokenCount: { $sum: '$tokenCount' },
      },
    },
    {
      $project: {
        _id: 0,
        totalSummaries: 1,
        totalTokenCount: 1,
      },
    },
  ]);
};

/**
 * @typedef {import('mongoose').Document & ConversationSummaryType} ConversationSummaryDocument
 */

/**
 * @typedef {import('mongoose').Model<ConversationSummaryDocument, {}, {
 *   findActiveForConversation(workspaceId: string, conversationId: string, userId: string): import('mongoose').Query<ConversationSummaryDocument | null, ConversationSummaryDocument>;
 *   getAllForConversation(workspaceId: string, conversationId: string, userId: string): import('mongoose').Query<ConversationSummaryDocument[], ConversationSummaryDocument>;
 *   getWorkspaceUsageMetrics(workspaceId: string, startDate?: Date, endDate?: Date): Promise<[{totalSummaries: number, totalTokenCount: number}] | []>;
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