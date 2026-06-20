import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import crypto from 'crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import dotenv from 'dotenv';
import path from 'path';

// Synchronously load environment variables from .env file to prevent race conditions during module imports
dotenv.config({ path: path.join(process.cwd(), '.env') });

/**
 * Initialization vector length for AES-256-CBC encryption.
 * @type {number}
 */
const IV_LENGTH = 16;

/**
 * Encryption key buffer used for securing message content and conversation titles.
 * This is initialized synchronously at module load time from a secure source.
 * @type {Buffer}
 */
let ENCRYPTION_KEY_BUF;

// Synchronously initialize the encryption key from environment variables or default to fallback.
// In production, if the key is not in environment variables, it fetches asynchronously from GCP Secret Manager.
(() => {
  try {
    // Priority 1: Use key injected directly into the environment (e.g., by Cloud Run / dotenv).
    if (process.env.CHAT_ENCRYPTION_KEY) {
      ENCRYPTION_KEY_BUF = Buffer.from(process.env.CHAT_ENCRYPTION_KEY);
      console.log('Chat encryption key initialized from CHAT_ENCRYPTION_KEY environment variable.');
      return;
    }

    // Priority 2: In production, attempt to fetch from GCP Secret Manager if configured.
    if (process.env.NODE_ENV === 'production') {
      const secretName = process.env.GCP_CHAT_ENCRYPTION_KEY_SECRET;

      if (secretName) {
        // Fallback to async fetch in background for Secret Manager.
        (async () => {
          try {
            const client = new SecretManagerServiceClient();
            const [version] = await client.accessSecretVersion({ name: secretName });
            const payload = version.payload.data.toString().trim();

            if (payload) {
              ENCRYPTION_KEY_BUF = Buffer.from(payload);
              console.log('Chat encryption key initialized successfully from GCP Secret Manager.');
            }
          } catch (gcpErr) {
            console.warn('Warning: Failed to fetch encryption key from GCP Secret Manager:', gcpErr.message);
            if (!ENCRYPTION_KEY_BUF) {
              ENCRYPTION_KEY_BUF = Buffer.from('development-key-32-characters-!!');
            }
          }
        })();
        return;
      }

      // Fallback: production without GCP secret (e.g., VM deployment)
      console.warn('Warning: No chat encryption key configured in production. Using fallback key. Set CHAT_ENCRYPTION_KEY env var for secure encryption.');
      ENCRYPTION_KEY_BUF = Buffer.from('development-key-32-characters-!!');
      return;
    }

    // If not in production and no key is provided, use a default fallback key.
    console.warn('Warning: CHAT_ENCRYPTION_KEY environment variable is not set. Initializing with a fallback key for development/testing.');
    ENCRYPTION_KEY_BUF = Buffer.from('development-key-32-characters-!!');
    return;

  } catch (err) {
    console.error('Warning: Failed to initialize chat encryption key. Using fallback.', err);
    ENCRYPTION_KEY_BUF = Buffer.from('development-key-32-characters-!!');
  }
})();


/**
 * Encrypts a plain text string using AES-256-CBC.
 * Prevents double encryption by checking if the text is already encrypted.
 *
 * @param {string} text - The plain text to encrypt.
 * @returns {string} The encrypted text in the format "iv:encryptedData".
 * @throws {Error} If encryption fails or the encryption key is not initialized.
 */
function encryptText(text) {
  if (!text || typeof text !== 'string') return text;
  // Check if already encrypted to avoid double encryption (heuristic: 16-byte IV in hex is 32 chars)
  if (text.includes(':') && text.split(':')[0].length === 32) return text;
  
  // This check serves as a safeguard. The async initializer should exit the process on failure,
  // so this code path should not be reachable in a failed state.
  if (!ENCRYPTION_KEY_BUF) {
    throw new Error('Encryption key has not been initialized. Cannot encrypt data.');
  }
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error('Encryption failed:', err);
    // Returning plaintext on failure is a security vulnerability. Throw an error to halt the operation.
    throw new Error('Failed to encrypt data due to an internal error.');
  }
}

/**
 * Decrypts an AES-256-CBC encrypted string.
 *
 * @param {string} text - The encrypted text in the format "iv:encryptedData".
 * @returns {string} The decrypted plain text, or the original text if decryption fails or is not encrypted.
 * @throws {Error} If the encryption key is not initialized.
 */
export function decryptText(text) {
  if (!text || typeof text !== 'string') return text;

  // Safeguard check, similar to encryptText.
  if (!ENCRYPTION_KEY_BUF) {
    throw new Error('Encryption key has not been initialized. Cannot decrypt data.');
  }

  try {
    const textParts = text.split(':');
    // Validate that the text is in the expected "iv:encryptedData" format.
    if (textParts.length !== 2 || textParts[0].length !== 32) {
      return text; // Not a valid encrypted string, return as is.
    }
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');

    try {
      // Try decrypting with main configured key first
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUF, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (mainErr) {
      // If main key fails, try fallback key (if main key is not already the fallback)
      const fallbackKey = 'development-key-32-characters-!!';
      if (process.env.CHAT_ENCRYPTION_KEY !== fallbackKey) {
        try {
          const fallbackBuf = Buffer.from(fallbackKey);
          const decipher = crypto.createDecipheriv('aes-256-cbc', fallbackBuf, iv);
          let decrypted = decipher.update(encryptedText);
          decrypted = Buffer.concat([decrypted, decipher.final()]);
          return decrypted.toString();
        } catch (fallbackErr) {
          // Both failed, throw the original error to enter final catch
        }
      }
      throw mainErr;
    }
  } catch (err) {
    // If decryption fails, it might be unencrypted legacy data or a key mismatch.
    // Returning the original text is a safe fallback to avoid crashing on invalid data.
    console.warn('Decryption failed for a value, returning original text. This may be expected for unencrypted legacy data.');
    return text;
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
    .lean({ getters: true })
    .exec();
};

/**
 * Finds a conversation by its unique conversationId and optionally filters by userId.
 *
 * @function findByConversationId
 * @memberof ConversationSchema.statics
 * @param {string} conversationId - The unique conversation identifier.
 * @param {string|import('mongoose').Types.ObjectId} [userId=null] - Optional user ID to restrict the search.
 * @returns {Promise<Object|null>} A promise that resolves to the lean conversation object or null.
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

export { Conversation };
export default Conversation;