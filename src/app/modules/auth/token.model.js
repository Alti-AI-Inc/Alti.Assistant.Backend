import mongoose from 'mongoose';
// Security Patch: Import bcryptjs for hashing tokens to prevent storing them in plaintext.
import bcrypt from 'bcryptjs';

/**
 * @typedef {object} TokenSchemaDefinition
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user associated with this token.
 * @property {string} token - The actual token string.
 * @property {Date} expiresAt - The date and time when this token expires.
 * @property {'emailVerification'|'passwordReset'|'deleteAccount'} type - The type or purpose of the token.
 */

/**
 * Mongoose Schema for the Token model.
 * Defines the structure and validation rules for tokens used in various authentication flows
 * such as email verification, password reset, and account deletion.
 *
 * @type {mongoose.Schema<TokenSchemaDefinition>}
 */
const TokenSchema = new mongoose.Schema(
  {
    /**
     * The ID of the user associated with this token.
     * References the 'User' model.
     * @type {mongoose.Schema.Types.ObjectId}
     * @required
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /**
     * The actual token string. This will be hashed before being saved to the database.
     * @type {string}
     * @required
     */
    token: {
      type: String,
      required: true,
    },
    /**
     * The date and time when this token expires.
     * @type {Date}
     * @required
     */
    expiresAt: {
      type: Date,
      required: true,
    },
    /**
     * The type or purpose of the token.
     * Can be 'emailVerification', 'passwordReset', or 'deleteAccount'.
     * @type {'emailVerification'|'passwordReset'|'deleteAccount'}
     * @required
     */
    type: {
      type: String,
      enum: ['emailVerification', 'passwordReset', 'deleteAccount'],
      required: true,
    },
  },
  {
    /**
     * Mongoose schema options.
     * @property {boolean} timestamps - Automatically adds `createdAt` and `updatedAt` fields.
     */
    timestamps: true,
  }
);

// Security Patch: Add a pre-save hook to hash the token before storing it.
// Storing tokens in plaintext is a security risk. If the database is compromised,
// attackers could use the tokens to take over user accounts.
TokenSchema.pre('save', async function (next) {
  // Only hash the token if it has been modified (or is new)
  if (!this.isModified('token')) {
    return next();
  }

  try {
    // Hash the token with a salt round of 12, a strong and recommended value.
    const salt = await bcrypt.genSalt(12);
    this.token = await bcrypt.hash(this.token, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

// Security Patch: Add an instance method to compare a candidate token with the hashed token in the database.
// This allows for secure verification without ever storing the plaintext token.
TokenSchema.methods.compareToken = async function (candidateToken) {
  return bcrypt.compare(candidateToken, this.token);
};

/**
 * Mongoose Model for the 'Token' collection.
 * Represents a token used for various authentication and account management purposes.
 *
 * @typedef {object} TokenDocument
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user associated with this token.
 * @property {string} token - The hashed token string.
 * @property {Date} expiresAt - The date and time when this token expires.
 * @property {'emailVerification'|'passwordReset'|'deleteAccount'} type - The type or purpose of the token.
 * @property {Date} createdAt - The date and time when the token was created.
 * @property {Date} updatedAt - The date and time when the token was last updated.
 * @property {function(string): Promise<boolean>} compareToken - Method to compare a candidate token with the stored hash.
 *
 * @type {mongoose.Model<TokenDocument>}
 */
const Token = mongoose.model('Token', TokenSchema);

/**
 * Exports the Mongoose Token model.
 * @type {mongoose.Model<TokenDocument>}
 */
export default Token;