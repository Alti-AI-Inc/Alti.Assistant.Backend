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

const userMemorySchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
      get: decryptText,
      set: encryptText,
    },
    category: {
      type: String,
      enum: ['facts', 'preferences', 'settings'],
      default: 'facts',
    },
    confidence: {
      type: Number,
      default: 1.0,
    },
  },
  {
    timestamps: true,
    collection: 'user_memories',
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Ensure a user can only have one unique record per key (e.g. unique occupation, tech stack)
userMemorySchema.index({ userId: 1, key: 1 }, { unique: true });

const UserMemory = model('UserMemory', userMemorySchema);

export default UserMemory;
