import { Schema, model } from 'mongoose';
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

const conversationSummarySchema = new Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      get: decryptText,
      set: encryptText,
    },
    context: {
      type: String,
      default: '',
      get: decryptText,
      set: encryptText,
    },
    messageRange: {
      startIndex: {
        type: Number,
        required: true,
      },
      endIndex: {
        type: Number,
        required: true,
      },
      totalMessages: {
        type: Number,
        required: true,
      },
    },
    tokenCount: {
      type: Number,
      required: true,
    },
    metadata: {
      keyTopics: [String],
      entities: [String],
      detectedApps: [String],
      summaryVersion: {
        type: String,
        default: '1.0',
      },
    },
    status: {
      type: String,
      enum: ['active', 'archived', 'superseded'],
      default: 'active',
    },
  },
  {
    timestamps: true,
    collection: 'conversation_summaries',
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Compound index for efficient queries
conversationSummarySchema.index({ conversationId: 1, userId: 1 });
conversationSummarySchema.index({ conversationId: 1, status: 1 });

// Static method to find active summary for a conversation
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

// Static method to get all summaries for a conversation
conversationSummarySchema.statics.getAllForConversation = function (
  conversationId,
  userId
) {
  return this.find({
    conversationId,
    userId,
  }).sort({ 'messageRange.startIndex': 1 });
};

const ConversationSummary = model(
  'ConversationSummary',
  conversationSummarySchema
);

export default ConversationSummary;
