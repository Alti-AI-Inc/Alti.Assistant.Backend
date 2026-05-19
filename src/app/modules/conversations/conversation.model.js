import mongoose from 'mongoose';
import { Schema } from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 32 characters
const IV_LENGTH = 16;

function encryptText(text) {
  if (!text || typeof text !== 'string') return text;
  // Check if already encrypted to avoid double encryption (heuristic)
  if (text.includes(':') && text.split(':')[0].length === 32) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    return text;
  }
}

function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) return text; // Not encrypted
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    return text; // Fallback if decryption fails
  }
}

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
ConversationSchema.index({ userId: 1, createdAt: -1 });
ConversationSchema.index({ userId: 1, status: 1 });
ConversationSchema.index({ userId: 1, knowledgebaseId: 1 });
ConversationSchema.index({ knowledgebaseId: 1, status: 1 });
ConversationSchema.index({ 'metadata.category': 1 });
ConversationSchema.index({ lastActivity: -1 });
ConversationSchema.index({ userId: 1, is_deep_search: 1 }); // Index for deep search filtering

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

// Instance method to add a message
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

// Instance method to get latest messages with limit
ConversationSchema.methods.getRecentMessages = function (limit = 10) {
  return this.messages.slice(-limit).map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    metadata: msg.metadata,
  }));
};

// Static method to find active conversations for a user
ConversationSchema.statics.findActiveByUser = function (userId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    sortBy = 'lastActivity',
    sortOrder = -1,
  } = options;

  return this.find({ userId, status: 'active' })
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(skip)
    .select('-messages'); // Exclude messages for list view
};

// Static method to find conversation by conversationId and userId
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

const Conversation = mongoose.model('Conversation', ConversationSchema);

export default Conversation;
