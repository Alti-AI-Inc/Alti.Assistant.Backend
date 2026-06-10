import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import crypto from 'crypto';

/**
 * Encryption key used for securing message content and conversation titles.
 * Defaults to a fallback 32-character key if not provided in environment variables.
 * @type {string}
 */
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 characters

/**
 * Initialization vector length for AES-256-CBC encryption.
 * @type {number}
 */
const IV_LENGTH = 16;

/**
 * Pre-allocated buffer of the encryption key to optimize performance.
 * Pre-allocating avoids repeated Buffer creation overhead during serialization/deserialization.
 * @type {Buffer}
 */
const ENCRYPTION_KEY_BUF = Buffer.from(ENCRYPTION_KEY);

/**
 * Encrypts a plain text string using AES-256-CBC.
 * Prevents double encryption by checking if the text is already encrypted.
 *
 * @param {string} text - The plain text to encrypt.
 * @returns {string} The encrypted text in the format "iv:encryptedData", or the original text if encryption fails or is skipped.
 */
function encryptText(text) {
  if (!text || typeof text !== 'string') return text;
  // Check if already encrypted to avoid double encryption (heuristic)
  if (text.includes(':') && text.split(':')[0].length === 32) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    return text;
  }
}

/**
 * Decrypts an AES-256-CBC encrypted string.
 *
 * @param {string} text - The encrypted text in the format "iv:encryptedData".
 * @returns {string} The decrypted plain text, or the original text if decryption fails or is not encrypted.
 */
function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) return text; // Not encrypted
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    return text; // Fallback if decryption fails
  }
}

/**
 * Mongoose Schema representing an individual message within a conversation.
 * Message content is automatically encrypted on save and decrypted on retrieval.
 * @type {import('mongoose').Schema}
 */
const MessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      get: decryptText,
      set: encryptText,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    _id: false, // Don't create separate _id for message subdocuments
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

/**
 * Mongoose Schema representing a conversation.
 * Supports multi-tenancy, encryption of sensitive fields, and metadata tracking.
 * @type {import('mongoose').Schema}
 */
const ConversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true, // Index on conversationId as requested
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    knowledgebaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeBase',
      default: null,
      index: true,
    },
    title: {
      type: String,
      default: 'New Conversation',
      get: decryptText,
      set: encryptText,
    },
    messages: [MessageSchema],
    status: {
      type: String,
      enum: ['active', 'archived', 'deleted'],
      default: 'active',
    },
    metadata: {
      model: { type: String }, // AI model used
      temperature: { type: Number },
      maxTokens: { type: Number },
      tags: [{ type: String }],
      category: { type: String },
      customData: { type: mongoose.Schema.Types.Mixed },
      userType: {
        type: String,
      },

      isGuest: {
        type: Boolean,
        default: false,
      },
    },
    documents_metadata: {
      documents: {
        type: Schema.Types.Mixed,
      },
      currentDocumentId: { type: String },
    },
    contractMetadata: {
      generatedContract: { type: String },
      contractType: { type: String },
      contractParams: { type: Schema.Types.Mixed },
      pendingQuestions: { type: Schema.Types.Mixed },
      currentQuestionIndex: { type: Number, default: 0 },
      allQuestionsAnswered: { type: Boolean, default: false },
      contractGenerated: { type: Boolean, default: false },
      uploadedFiles: [{ type: Schema.Types.Mixed }],
      currentDocumentId: { type: String },
    },
    presentation_metadata: {
      type: Schema.Types.Mixed,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    is_deep_search: {
      type: Boolean,
      default: false,
    },

    is_saved: {
      type: Boolean,
      default: false,
    },

    // Multi-tenant support
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    versionKey: false,
    strict: false,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Indexes for better query performance
ConversationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
ConversationSchema.index({ tenantId: 1, userId: 1, status: 1 });
ConversationSchema.index({ tenantId: 1, userId: 1, knowledgebaseId: 1 });
ConversationSchema.index({ tenantId: 1, knowledgebaseId: 1, status: 1 });
ConversationSchema.index({ tenantId: 1, 'metadata.category': 1 });
ConversationSchema.index({ tenantId: 1, lastActivity: -1 });
ConversationSchema.index({ tenantId: 1, userId: 1, is_deep_search: 1 }); // Index for deep search filtering

// Optimization: Compound indexes to support sorting by lastActivity on active queries (prevents in-memory sorting)
ConversationSchema.index({ tenantId: 1, userId: 1, status: 1, lastActivity: -1 });
ConversationSchema.index({ userId: 1, status: 1, lastActivity: -1 });

// Legacy / fallback simple indexes (retained for direct cross-tenant or admin queries)
ConversationSchema.index({ userId: 1, createdAt: -1 });
ConversationSchema.index({ userId: 1, status: 1 });
ConversationSchema.index({ userId: 1, knowledgebaseId: 1 });
ConversationSchema.index({ knowledgebaseId: 1, status: 1 });
ConversationSchema.index({ 'metadata.category': 1 });
ConversationSchema.index({ lastActivity: -1 });
ConversationSchema.index({ userId: 1, is_deep_search: 1 });

// Update lastActivity on message operations
ConversationSchema.pre('save', function (next) {
  if (this.isModified('messages')) {
    this.lastActivity = new Date();
    this.messageCount = this.messages.length;
  }
  next();
});

// Virtual for conversation URL or identifier
ConversationSchema.virtual('url').get(function () {
  return `/conversations/${this.conversationId}`;
});

/**
 * Adds a new message to the conversation and updates activity metadata.
 *
 * @function addMessage
 * @memberof ConversationSchema.methods
 * @param {'user'|'assistant'|'system'} role - The role of the message sender.
 * @param {string} content - The content of the message.
 * @param {Object} [metadata={}] - Optional metadata associated with the message.
 * @returns {import('mongoose').Document} The updated conversation document.
 */
ConversationSchema.methods.addMessage = function (
  role,
  content,
  metadata = {}
) {
  this.messages.push({
    role,
    content,
    metadata,
    timestamp: new Date(),
  });
  this.lastActivity = new Date();
  this.messageCount = this.messages.length;
  return this;
};

/**
 * Retrieves the most recent messages from the conversation.
 *
 * @function getRecentMessages
 * @memberof ConversationSchema.methods
 * @param {number} [limit=10] - The maximum number of messages to retrieve.
 * @returns {Array<Object>} Array of formatted message objects.
 */
ConversationSchema.methods.getRecentMessages = function (limit = 10) {
  return this.messages.slice(-limit).map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    metadata: msg.metadata,
  }));
};

/**
 * Finds active conversations for a specific user with pagination and sorting.
 * Excludes the messages field for performance optimization.
 *
 * @function findActiveByUser
 * @memberof ConversationSchema.statics
 * @param {string|import('mongoose').Types.ObjectId} userId - The ID of the user.
 * @param {Object} [options={}] - Query options.
 * @param {number} [options.limit=20] - Maximum number of documents to return.
 * @param {number} [options.skip=0] - Number of documents to skip.
 * @param {string} [options.sortBy='lastActivity'] - Field to sort by.
 * @param {number} [options.sortOrder=-1] - Sort order (1 for ascending, -1 for descending).
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of lean conversation objects.
 */
ConversationSchema.statics.findActiveByUser = function (userId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    sortBy = 'lastActivity',
    sortOrder = -1,
  } = options;

  // Optimization: Added .lean({ getters: true }) to bypass Mongoose document hydration overhead 
  // while still allowing the decryption getters to run on the title field.
  return this.find({ userId, status: 'active' })
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(skip)
    .select('-messages') // Exclude messages for list view
    .lean({ getters: true });
};

/**
 * Finds a conversation by its unique conversationId and optionally filters by userId.
 *
 * @function findByConversationId
 * @memberof ConversationSchema.statics
 * @param {string} conversationId - The unique conversation identifier.
 * @param {string|import('mongoose').Types.ObjectId} [userId=null] - Optional user ID to restrict the search.
 * @returns {Promise<import('mongoose').Document|null>} A promise that resolves to the conversation document or null.
 */
ConversationSchema.statics.findByConversationId = function (
  conversationId,
  userId = null
) {
  const query = { conversationId };
  if (userId) {
    query.userId = userId;
  }
  return this.findOne(query);
};

/**
 * Mongoose Model for Conversation.
 * @type {import('mongoose').Model<import('mongoose').Document>}
 */
const Conversation = mongoose.model('Conversation', ConversationSchema);

export default Conversation;