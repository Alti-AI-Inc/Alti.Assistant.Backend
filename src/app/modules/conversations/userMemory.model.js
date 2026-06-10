import { Schema, model } from 'mongoose';
import crypto from 'crypto';

// --- SECURITY FIX: Ensure encryption key is provided and valid ---
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY;
const CBC_IV_LENGTH = 16; // For legacy AES-256-CBC
const GCM_IV_LENGTH = 12; // For modern AES-256-GCM
const GCM_TAG_LENGTH = 16;

if (!ENCRYPTION_KEY) {
  console.error('CRITICAL ERROR: CHAT_ENCRYPTION_KEY environment variable is not set.');
  process.exit(1);
}

// Pre-buffer the key for performance and to ensure consistent type
const ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'utf-8');

// AES-256 requires a 32-byte (256-bit) key.
if (ENCRYPTION_KEY_BUFFER.length !== 32) {
  console.error('CRITICAL ERROR: CHAT_ENCRYPTION_KEY must resolve to exactly 32 bytes.');
  process.exit(1);
}

// Cryptographically verify if a string is already encrypted to prevent double encryption
// and eliminate the spoofable heuristic bypass vulnerability.
function isEncrypted(text) {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  
  // Check GCM format: iv:authTag:ciphertext
  if (parts.length === 3) {
    try {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = Buffer.from(parts[2], 'hex');
      if (iv.length !== GCM_IV_LENGTH || authTag.length !== GCM_TAG_LENGTH) return false;
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY_BUFFER, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return true;
    } catch (err) {
      return false;
    }
  }
  
  // Check legacy CBC format: iv:ciphertext
  if (parts.length === 2) {
    try {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      if (iv.length !== CBC_IV_LENGTH) return false;
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return true;
    } catch (err) {
      return false;
    }
  }
  
  return false;
}

function encryptText(text) {
  if (!text || typeof text !== 'string') return text;

  // Prevent double encryption by checking if the text is already encrypted (GCM or CBC)
  if (isEncrypted(text)) {
    return text;
  }
  
  try {
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    // Upgrade to AES-256-GCM for authenticated encryption (prevents padding oracle and tampering)
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY_BUFFER, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
  } catch (err) {
    console.error('Encryption failed:', err);
    throw new Error('Failed to encrypt data.');
  }
}

function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const parts = text.split(':');
    
    // Decrypt modern GCM format
    if (parts.length === 3) {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = Buffer.from(parts[2], 'hex');

      if (iv.length !== GCM_IV_LENGTH || authTag.length !== GCM_TAG_LENGTH) {
        return text;
      }

      const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY_BUFFER, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    // Decrypt legacy CBC format
    if (parts.length === 2) {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');

      if (iv.length !== CBC_IV_LENGTH) {
        return text;
      }

      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    return text;
  } catch (err) {
    console.warn('Decryption failed, returning original text:', err);
    return text;
  }
}

const userMemorySchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      // OPTIMIZATION: Removed redundant single-field index.
      // The compound index { userId: 1, key: 1 } below covers queries on userId alone,
      // making this one unnecessary and saving on write overhead/storage space.
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

// PERFORMANCE: This compound index is crucial for performance on findOne({ userId, key }) lookups.
// It also ensures a user can only have one unique record per key (e.g. unique occupation, tech stack).
userMemorySchema.index({ userId: 1, key: 1 }, { unique: true });

const UserMemory = model('UserMemory', userMemorySchema);

export default UserMemory;