import mongoose from 'mongoose';
// Security Patch: Import bcryptjs for hashing tokens to prevent storing them in plaintext.
import bcrypt from 'bcryptjs';

/**
 * @typedef {object} TokenSchemaDefinition
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user associated with this token (e.g., the user for password reset, or the manager sending an invitation).
 * @property {string} token - The actual token string.
 * @property {Date} expiresAt - The date and time when this token expires.
 * @property {'emailVerification'|'passwordReset'|'deleteAccount'|'workspaceInvitation'} type - The type or purpose of the token.
 * @property {mongoose.Schema.Types.ObjectId} [workspaceId] - The ID of the workspace for an invitation token.
 * @property {string} [invitedUserEmail] - The email of the user being invited for an invitation token.
 * @property {'manager'|'member'} [role] - The role assigned to the user upon accepting an invitation.
 */

/**
 * Mongoose Schema for the Token model.
 * Defines the structure and validation rules for tokens used in various authentication and management flows
 * such as email verification, password reset, account deletion, and workspace invitations.
 *
 * @type {mongoose.Schema<TokenSchemaDefinition>}
 */
const TokenSchema = new mongoose.Schema(
  {
    /**
     * The ID of the user associated with this token. For standard auth flows, this is the target user.
     * For workspace invitations, this is the ID of the manager who sent the invitation.
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
     * 'workspaceInvitation' is used for inviting new members to a workspace.
     * @type {'emailVerification'|'passwordReset'|'deleteAccount'|'workspaceInvitation'}
     * @required
     */
    type: {
      type: String,
      enum: ['emailVerification', 'passwordReset', 'deleteAccount', 'workspaceInvitation'],
      required: true,
    },

    // --- Improvement: Add fields specific to 'workspaceInvitation' to support Manager dashboard features ---

    /**
     * The ID of the workspace to which a user is being invited.
     * This field is required only when the token type is 'workspaceInvitation'.
     * @type {mongoose.Schema.Types.ObjectId}
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: function () {
        return this.type === 'workspaceInvitation';
      },
    },
    /**
     * The email address of the person being invited.
     * This field is required only when the token type is 'workspaceInvitation'.
     * @type {string}
     */
    invitedUserEmail: {
      type: String,
      trim: true,
      lowercase: true,
      required: function () {
        return this.type === 'workspaceInvitation';
      },
    },
    /**
     * The role to be assigned to the invited user upon acceptance (e.g., 'manager', 'member').
     * This field is required only when the token type is 'workspaceInvitation'.
     * @type {string}
     */
    role: {
      type: String,
      enum: ['manager', 'member'], // Define the possible roles for team members.
      required: function () {
        return this.type === 'workspaceInvitation';
      },
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

  // Do not hash short-lived 6-digit OTP email verification tokens
  // to allow direct O(1) indexed lookups by token value.
  if (this.type === 'emailVerification') {
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
  if (this.type === 'emailVerification') {
    return candidateToken === this.token;
  }
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
 * @property {'emailVerification'|'passwordReset'|'deleteAccount'|'workspaceInvitation'} type - The type or purpose of the token.
 * @property {mongoose.Schema.Types.ObjectId} [workspaceId] - The ID of the workspace for an invitation token.
 * @property {string} [invitedUserEmail] - The email of the user being invited for an invitation token.
 * @property {'manager'|'member'} [role] - The role assigned to the user upon accepting an invitation.
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