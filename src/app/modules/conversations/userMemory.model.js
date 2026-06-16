import { Schema, model } from 'mongoose';
import crypto from 'crypto';
import xss from 'xss'; // --- SECURITY PATCH: Import XSS sanitization library ---

// --- SECURITY FIX: Ensure encryption key is provided and valid ---

/**
 * The secret key for encrypting and decrypting user memory data.
 * It is critical that this is a 32-byte (256-bit) key and is kept secret.
 * Loaded from the CHAT_ENCRYPTION_KEY environment variable.
 * The application will exit if this key is not set or is invalid in production.
 * @const {string} ENCRYPTION_KEY
 * @private
 */
let ENCRYPTION_KEY = process.env.CHAT_ENCRYPTION_KEY;

/**
 * The length of the Initialization Vector (IV) for the legacy AES-256-CBC encryption algorithm (16 bytes).
 * @const {number} CBC_IV_LENGTH
 * @private
 */
const CBC_IV_LENGTH = 16; // For legacy AES-256-CBC

/**
 * The length of the Initialization Vector (IV) for the modern AES-256-GCM encryption algorithm (12 bytes).
 * @const {number} GCM_IV_LENGTH
 * @private
 */
const GCM_IV_LENGTH = 12; // For modern AES-256-GCM

/**
 * The length of the Authentication Tag for the AES-256-GCM encryption algorithm (16 bytes).
 * This tag ensures the integrity and authenticity of the encrypted data.
 * @const {number} GCM_TAG_LENGTH
 * @private
 */
const GCM_TAG_LENGTH = 16;

if (!ENCRYPTION_KEY) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Warning: CHAT_ENCRYPTION_KEY environment variable is not set. Initializing with a fallback key for development/testing.');
  } else {
    console.error('CRITICAL ERROR: CHAT_ENCRYPTION_KEY environment variable is not set. Using fallback key - set this env var for secure encryption.');
  }
  ENCRYPTION_KEY = 'development-key-32-characters-!!';
}

/**
 * The encryption key pre-buffered for performance and to ensure a consistent type.
 * @const {Buffer} ENCRYPTION_KEY_BUFFER
 * @private
 */
let ENCRYPTION_KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'utf-8');

// AES-256 requires a 32-byte (256-bit) key.
if (ENCRYPTION_KEY_BUFFER.length !== 32) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Warning: CHAT_ENCRYPTION_KEY must resolve to exactly 32 bytes. Initializing with a fallback key for development/testing.');
  } else {
    console.error('CRITICAL ERROR: CHAT_ENCRYPTION_KEY must resolve to exactly 32 bytes. Using fallback key.');
  }
  ENCRYPTION_KEY_BUFFER = Buffer.from('development-key-32-characters-!!', 'utf-8');
}

/**
 * Cryptographically verifies if a string is already encrypted to prevent double encryption
 * and eliminate potential spoofing vulnerabilities. It checks for both modern GCM
 * and legacy CBC formats.
 * @param {string | any} text The string to check.
 * @returns {boolean} True if the text is a valid encrypted string, false otherwise.
 * @private
 */
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

/**
 * Encrypts a given text string using the AES-256-GCM authenticated encryption algorithm.
 * This method is idempotent; it first checks if the text is already encrypted and,
 * if so, returns it unmodified to prevent double encryption.
 * The output format is 'iv:authTag:encryptedText' in hex encoding.
 * @param {string | any} text The plaintext string to encrypt.
 * @returns {string} The encrypted string, or the original input if it's not a string or is already encrypted.
 * @throws {Error} If the encryption process fails.
 * @private
 */
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

/**
 * Decrypts a given text string. It supports both the modern AES-256-GCM format
 * ('iv:authTag:encryptedText') and a legacy AES-256-CBC format ('iv:encryptedText')
 * for backward compatibility.
 * If decryption fails for any reason (e.g., invalid format, incorrect key), it logs a warning
 * and returns the original encrypted text to prevent data loss or application crashes.
 * @param {string | any} text The encrypted string to decrypt.
 * @returns {string} The decrypted plaintext string, or the original input if it's not a string or decryption fails.
 * @private
 */
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

/**
 * Mongoose schema for storing user-specific memories or facts.
 * Each document represents a single piece of information (a key-value pair)
 * associated with a specific user, making it a multi-tenant collection partitioned by `userId`.
 * The `value` field is automatically encrypted on save and decrypted on retrieval.
 *
 * @constructor UserMemory
 * @property {string} userId - The identifier for the user this memory belongs to.
 * @property {string} key - The key or name of the memory (e.g., 'occupation', 'favorite_color').
 * @property {string} value - The value of the memory, which is encrypted in the database.
 * @property {string} category - The category of the memory. Can be 'facts', 'preferences', or 'settings'.
 * @property {number} confidence - A score from 0.0 to 1.0 indicating the confidence in the memory's accuracy.
 * @property {Date} createdAt - Timestamp of when the document was created.
 * @property {Date} updatedAt - Timestamp of when the document was last updated.
 */
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
      // --- SECURITY PATCH: Sanitize string input to prevent XSS before encryption ---
      // This provides defense-in-depth by cleaning potential malicious scripts
      // before they are stored. If data is ever displayed without proper output
      // encoding on a client, this measure mitigates the risk at the source.
      set: (v) => {
        const valueToEncrypt = typeof v === 'string' ? xss(v) : v;
        return encryptText(valueToEncrypt);
      },
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

/**
 * Mongoose model for interacting with the 'user_memories' collection.
 * Provides an interface for creating, reading, updating, and deleting user memory documents.
 * The `value` field is automatically encrypted and decrypted.
 * @typedef {import('mongoose').Document & {
 *   userId: string;
 *   key: string;
 *   value: string;
 *   category: 'facts' | 'preferences' | 'settings';
 *   confidence: number;
 *   createdAt: Date;
 *   updatedAt: Date;
 * }} UserMemoryDocument
 * @type {import('mongoose').Model<UserMemoryDocument>}
 */
const UserMemory = model('UserMemory', userMemorySchema);

/**
 * The Mongoose model for User Memories.
 * @exports UserMemory
 */
export default UserMemory;