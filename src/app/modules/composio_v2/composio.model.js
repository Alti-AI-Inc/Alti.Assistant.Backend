import mongoose, { connect } from 'mongoose';

/**
 * @typedef {object} ComposioAuthToolkit
 * @property {string} slug - The unique identifier (slug) for the toolkit.
 * @property {string} name - The display name of the toolkit.
 * @property {string} description - A brief description of the toolkit.
 * @property {string} icon - URL or identifier for the toolkit's icon.
 * @property {string[]} scopes - An array of scopes requested for this toolkit.
 * @property {object} metadata - Additional metadata related to the toolkit.
 */

/**
 * @typedef {object} ComposioAuthDocument
 * @property {mongoose.Types.ObjectId} userId - The ID of the user associated with this authentication.
 * @property {string} authConfigId - The unique identifier for the authentication configuration used.
 * @property {string} [connectedAccountId] - The ID of the connected account on the Composio platform.
 * @property {string} [integrationId] - The ID of the specific integration instance.
 * @property {string} redirectUrl - The URL to which the user was redirected after authentication.
 * @property {'ACTIVE'|'PENDING'|'FAILED'|'EXPIRED'|'REVOKED'} status - The current status of the authentication.
 * @property {string} [accessToken] - The access token obtained during authentication.
 * @property {string} [refreshToken] - The refresh token obtained during authentication.
 * @property {string} [idToken] - The ID token obtained during authentication (e.g., for OIDC).
 * @property {ComposioAuthToolkit} [toolkit] - Information about the Composio toolkit associated with this authentication.
 * @property {mongoose.Types.ObjectId|null} [tenantId] - The ID of the tenant this authentication belongs to, if multi-tenancy is enabled.
 * @property {Date} createdAt - The timestamp when the document was created.
 * @property {Date} updatedAt - The timestamp when the document was last updated.
 */

/**
 * Mongoose Schema for ComposioAuth.
 * Represents an authentication record for a user with a Composio integration.
 * This schema stores details about the authentication process, including tokens,
 * status, and associated user/tenant information.
 *
 * @type {mongoose.Schema<ComposioAuthDocument>}
 */
const ComposioAuthSchema = new mongoose.Schema({
  /**
   * The ID of the user associated with this authentication.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref User
   * @required true
   * @index true
   */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  /**
   * The unique identifier for the authentication configuration used.
   * This typically corresponds to a specific application or integration setup.
   * @type {string}
   * @required true
   * @index true
   */
  authConfigId: {
    type: String,
    required: true,
    index: true,
  },

  /**
   * The ID of the connected account on the Composio platform.
   * This is often provided by Composio after a successful connection.
   * @type {string}
   * @index true
   */
  connectedAccountId: {
    type: String,
    index: true,
  },
  /**
   * The ID of the specific integration instance.
   * @type {string}
   */
  integrationId: {
    type: String,
  },
  /**
   * The URL to which the user was redirected after completing the authentication flow.
   * This can be used for context or verification.
   * @type {string}
   * @required true
   */
  redirectUrl: {
    type: String,
    required: true,
  },
  /**
   * The current status of the authentication.
   * - 'ACTIVE': The authentication is valid and usable.
   * - 'PENDING': The authentication process has started but not yet completed.
   * - 'FAILED': The authentication attempt failed.
   * - 'EXPIRED': The authentication tokens have expired and need to be refreshed or re-authenticated.
   * - 'REVOKED': The authentication has been explicitly revoked by the user or system.
   * @type {'ACTIVE'|'PENDING'|'FAILED'|'EXPIRED'|'REVOKED'}
   * @default 'PENDING'
   */
  status: {
    type: String,
    enum: ['ACTIVE', 'PENDING', 'FAILED', 'EXPIRED', 'REVOKED'],
    default: 'PENDING',
    set: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
  },
  /**
   * The access token obtained during authentication.
   * Used to make authorized requests to the integrated service.
   * @type {string}
   */
  accessToken: {
    type: String,
  },
  /**
   * The refresh token obtained during authentication.
   * Used to obtain new access tokens when the current one expires.
   * @type {string}
   */
  refreshToken: {
    type: String,
  },
  /**
   * The ID token obtained during authentication (e.g., for OpenID Connect).
   * Contains claims about the authenticated user.
   * @type {string}
   */
  idToken: {
    type: String,
  },
  /**
   * Information about the Composio toolkit associated with this authentication.
   * Includes details like slug, name, description, and requested scopes.
   * @type {ComposioAuthToolkit}
   */
  toolkit: {
    type: Object,
  },

  /**
   * Multi-tenant support: The ID of the tenant this authentication belongs to.
   * @type {mongoose.Schema.Types.ObjectId|null}
   * @ref Tenant
   * @default null
   * @index true
   */
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
}, {
  /**
   * Mongoose timestamps option.
   * Adds `createdAt` and `updatedAt` fields to the schema.
   * @type {boolean}
   */
  timestamps: true
});

/**
 * Compound index for the most common query pattern:
 * finding active connections for a user's specific toolkit.
 * Optimizes queries that filter by `userId`, `status`, and `toolkit.slug`.
 */
ComposioAuthSchema.index({ userId: 1, status: 1, 'toolkit.slug': 1 });
/**
 * Compound index for authConfigId-based lookups.
 * Optimizes queries that filter by `userId`, `status`, and `authConfigId`.
 */
ComposioAuthSchema.index({ userId: 1, status: 1, authConfigId: 1 });

/**
 * Mongoose Model for ComposioAuth.
 * Provides an interface to the `composioauths` collection in the database.
 *
 * @type {mongoose.Model<ComposioAuthDocument>}
 */
const ComposioAuth = mongoose.model('ComposioAuth', ComposioAuthSchema);

export default ComposioAuth;