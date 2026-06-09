import { Schema, model } from 'mongoose';
import crypto from 'crypto';

// --- SECURITY FIX: Ensure encryption key is provided and valid ---
// It is critical that the encryption key is loaded from environment variables
// and is not hardcoded, especially not with a default fallback.
const ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY;
const IV_LENGTH = 16; // For AES-256-CBC, IV length is 16 bytes (128 bits)

if (!ENCRYPTION_KEY) {
  // Log a critical error and exit if the key is not set.
  // The application should not start without a proper encryption key.
  console.error('CRITICAL ERROR: CHAT_ENCRYPTION_KEY environment variable is not set.');
  process.exit(1);
}

// AES-256 requires a 32-byte (256-bit) key.
if (ENCRYPTION_KEY.length !== 32) {
  // Log a critical error and exit if the key is not the correct length.
  console.error('CRITICAL ERROR: CHAT_ENCRYPTION_KEY must be 32 characters long for AES-256.');
  process.exit(1);
}

// Pre-buffer the key for performance and to ensure consistent type
const ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY);

function encryptText(text) {
  if (!text || typeof text !== 'string') return text;

  // Heuristic to prevent double encryption. If the text already looks like
  // an encrypted string (iv_hex:encrypted_hex), return it as is.
  // This assumes the setter is only called on raw text or already encrypted text.
  if (text.includes(':') && text.split(':')[0].length === IV_LENGTH * 2) { // IV hex length is IV_LENGTH * 2
    return text;
  }
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    // Use the pre-buffered key
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    // --- SECURITY FIX: Do not store plaintext if encryption fails ---
    // If encryption fails, throw an error to prevent the document from being saved
    // with unencrypted data. This ensures data integrity and security.
    console.error('Encryption failed:', err);
    throw new Error('Failed to encrypt data.');
  }
}

function decryptText(text) {
  if (!text || typeof text !== 'string') return text;
  try {
    const textParts = text.split(':');
    // If it doesn't match the expected encrypted format (iv_hex:encrypted_hex), return as is.
    // This handles cases where data might not have been encrypted or was corrupted.
    if (textParts.length !== 2 || textParts[0].length !== IV_LENGTH * 2) {
      return text;
    }
    
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    // Use the pre-buffered key
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BUFFER, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    // For decryption, returning the original text on failure is generally acceptable
    // as it means the application will see the raw (potentially encrypted-looking) data,
    // rather than crashing. The consuming application can then decide how to handle it.
    console.warn('Decryption failed, returning original text:', err);
    return text;
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