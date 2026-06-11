import mongoose from 'mongoose';

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
 * Mongoose Schema for ComposioAuthToolkit.
 * Defines the structure for the embedded toolkit information.
 * @type {mongoose.Schema<ComposioAuthToolkit>}
 */
const ComposioAuthToolkitSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  icon: {
    type: String,
  },
  scopes: {
    type: [String], // Array of strings
  },
  metadata: {
    type: Object, // Can be an empty object or more specific schema if needed
  },
}, { _id: false }); // Embedded sub-documents typically don't need their own _id

/**
 * @typedef {object} ComposioAuthDocument
 * @property {mongoose.Types.ObjectId} tenantId - The ID of the tenant this authentication belongs to. Enforces multi-tenancy.
 * @property {mongoose.Types.ObjectId} workspaceId - The ID of the workspace this authentication belongs to. Enforces workspace-level context.
 * @property {mongoose.Types.ObjectId} connectedByUserId - The ID of the user who performed the authentication action.
 * @property {{id: mongoose.Types.ObjectId, type: 'User'|'Workspace'}} owner - Defines the ownership of the integration (personal or workspace-level).
 * @property {string} authConfigId - The unique identifier for the authentication configuration used.
 * @property {string} [connectedAccountId] - The ID of the connected account on the Composio platform.
 * @property {string} [integrationId] - The ID of the specific integration instance.
 * @property {string} redirectUrl - The URL to which the user was redirected after authentication.
 * @property {'ACTIVE'|'PENDING'|'FAILED'|'EXPIRED'|'REVOKED'} status - The current status of the authentication.
 * @property {string} [accessToken] - The access token obtained during authentication.
 * @property {string} [refreshToken] - The refresh token obtained during authentication.
 * @property {string} [idToken] - The ID token obtained during authentication (e.g., for OIDC).
 * @property {ComposioAuthToolkit} [toolkit] - Information about the Composio toolkit associated with this authentication.
 * @property {Date|null} lastUsedAt - Timestamp of the last time this integration was used.
 * @property {Date} createdAt - The timestamp when the document was created.
 * @property {Date} updatedAt - The timestamp when the document was last updated.
 */

/**
 * Mongoose Schema for ComposioAuth.
 * Represents an authentication record for a user with a Composio integration.
 * This schema stores details about the authentication process, including tokens,
 * status, and associated user/tenant/workspace information.
 *
 * @type {mongoose.Schema<ComposioAuthDocument>}
 */
const ComposioAuthSchema = new mongoose.Schema({
  /**
   * Multi-tenant support: The ID of the tenant this authentication belongs to.
   * This is a critical field for data isolation and security.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref Tenant
   * @required true
   * @index true
   */
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'A tenant ID is required for all authentications.'],
    index: true,
  },

  /**
   * Workspace Context: The ID of the workspace this authentication is associated with.
   * Ensures that integrations are scoped to the correct workspace, preventing context leakage.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref Workspace
   * @required true
   * @index true
   */
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: [true, 'A workspace ID is required for all authentications.'],
    index: true,
  },

  /**
   * The ID of the user who performed the connection action.
   * This is used for auditing and tracking who initiated the authentication.
   * @type {mongoose.Schema.Types.ObjectId}
   * @ref User
   * @required true
   * @index true
   */
  connectedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  /**
   * Defines the ownership of the integration. This is crucial for applying limits,
   * managing permissions, and propagating usage data up the hierarchy.
   * An integration can be owned by an individual user or by the entire workspace.
   */
  owner: {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      // INTEGRATION_FIX: Use refPath to enable Mongoose's polymorphic population.
      // This allows `populate('owner.id')` to correctly fetch the associated User or Workspace document,
      // simplifying business logic and reducing the risk of integration errors when checking permissions or limits.
      refPath: 'owner.type',
    },
    type: {
      type: String,
      required: true,
      enum: ['User', 'Workspace'],
    }
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
   * SECURITY: This field should be encrypted at rest using a library like mongoose-encryption.
   * It is excluded from default query projections to prevent accidental exposure.
   * @type {string}
   */
  accessToken: {
    type: String,
    select: false,
  },
  /**
   * The refresh token obtained during authentication.
   * Used to obtain new access tokens when the current one expires.
   * SECURITY: This field should be encrypted at rest.
   * @type {string}
   */
  refreshToken: {
    type: String,
    select: false,
  },
  /**
   * The ID token obtained during authentication (e.g., for OpenID Connect).
   * Contains claims about the authenticated user.
   * SECURITY: This field should be encrypted at rest.
   * @type {string}
   */
  idToken: {
    type: String,
    select: false,
  },
  /**
   * Information about the Composio toolkit associated with this authentication.
   * Includes details like slug, name, description, and requested scopes.
   * @type {ComposioAuthToolkit}
   */
  toolkit: {
    type: ComposioAuthToolkitSchema, // Using the defined sub-schema for better validation
  },

  /**
   * Tracks the last time the integration was actively used.
   * This helps in identifying dormant connections and managing resource lifecycle.
   * @type {Date|null}
   */
  lastUsedAt: {
    type: Date,
    default: null,
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
 * finding active connections within a specific workspace.
 */
ComposioAuthSchema.index({ tenantId: 1, workspaceId: 1, status: 1 });

/**
 * Compound index for finding connections by a specific user.
 */
ComposioAuthSchema.index({ connectedByUserId: 1, status: 1, 'toolkit.slug': 1 });

/**
 * Compound index for finding connections by their owner (user or workspace).
 * This is crucial for applying limits and permissions based on ownership.
 */
ComposioAuthSchema.index({ 'owner.id': 1, 'owner.type': 1, status: 1 });

/**
 * BUGFIX: Unique partial index to prevent duplicate integrations for the same owner.
 * This ensures that a user or a workspace cannot have multiple active or pending connections
 * for the same authentication configuration, improving data integrity.
 * The partial filter allows for historical records of failed/revoked connections,
 * enabling a user to re-establish a connection after it was revoked.
 */
ComposioAuthSchema.index({ 'owner.id': 1, 'owner.type': 1, authConfigId: 1 }, {
  unique: true,
  partialFilterExpression: { status: { $in: ['ACTIVE', 'PENDING'] } }
});


/**
 * Mongoose Model for ComposioAuth.
 * Provides an interface to the `composioauths` collection in the database.
 *
 * @type {mongoose.Model<ComposioAuthDocument>}
 */
const ComposioAuth = mongoose.model('ComposioAuth', ComposioAuthSchema);

export default ComposioAuth;