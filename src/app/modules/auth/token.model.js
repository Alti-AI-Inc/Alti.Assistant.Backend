import mongoose from 'mongoose';

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
     * The actual token string.
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

/**
 * Mongoose Model for the 'Token' collection.
 * Represents a token used for various authentication and account management purposes.
 *
 * @typedef {object} TokenDocument
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user associated with this token.
 * @property {string} token - The actual token string.
 * @property {Date} expiresAt - The date and time when this token expires.
 * @property {'emailVerification'|'passwordReset'|'deleteAccount'} type - The type or purpose of the token.
 * @property {Date} createdAt - The date and time when the token was created.
 * @property {Date} updatedAt - The date and time when the token was last updated.
 *
 * @type {mongoose.Model<TokenDocument>}
 */
const Token = mongoose.model('Token', TokenSchema);

/**
 * Exports the Mongoose Token model.
 * @type {mongoose.Model<TokenDocument>}
 */
export default Token;