import mongoose from 'mongoose';

/**
 * @typedef {object} AuthConfigDocument
 * @property {string} app - The unique identifier for the application within a tenant.
 *                          This field is indexed for efficient lookups.
 * @property {string} authConfigId - A unique identifier for this specific authentication configuration.
 * @property {string} [authSchema] - The type or schema of the authentication mechanism (e.g., 'OAuth2', 'API_KEY').
 * @property {boolean} [isComposioManaged=false] - Indicates whether this authentication configuration is managed by Composio.
 * @property {mongoose.Types.ObjectId | null} [tenantId=null] - The ID of the tenant this configuration belongs to.
 *                                                               If null, it implies a global or un-tenanted configuration.
 *                                                               This field is indexed and references the 'Tenant' model.
 * @property {Date} createdAt - The timestamp when the document was created.
 * @property {Date} updatedAt - The timestamp when the document was last updated.
 */

/**
 * Mongoose Schema for the AuthConfig model.
 * Defines the structure for storing authentication configurations for various applications,
 * including multi-tenant support.
 *
 * @type {mongoose.Schema<AuthConfigDocument>}
 */
const AuthConfigSchema = mongoose.Schema({
  /**
   * The name or identifier of the application.
   * Required. Indexed for performance.
   * In a multi-tenant setup, 'app' names are unique per tenant.
   * A compound unique index on 'app' and 'tenantId' enforces this.
   * @type {string}
   * @required
   * @index
   */
  app: {
    type: String,
    required: true,
    // Removed 'unique: true' from 'app' field. In a multi-tenant setup,
    // 'app' names should typically be unique per tenant, not globally.
    // A compound unique index on 'app' and 'tenantId' is added below to enforce this.
    index: true,
  },
  /**
   * A unique identifier for this specific authentication configuration.
   * This could be a UUID or another unique string generated for the config instance.
   * @type {string}
   * @required
   */
  authConfigId: {
    type: String,
    required: true,
  },
  /**
   * The type or schema of the authentication mechanism.
   * Examples: 'OAuth2', 'API_KEY', 'BasicAuth'.
   * Optional.
   * @type {string}
   */
  authSchema: {
    type: String,
    required: false,
  },
  /**
   * Flag indicating if this authentication configuration is managed by Composio.
   * Defaults to `false`.
   * @type {boolean}
   * @default false
   */
  isComposioManaged: {
    type: Boolean,
    default: false,
  },

  /**
   * Multi-tenant support: The ID of the tenant this configuration belongs to.
   * If `null`, the configuration is considered global or not associated with a specific tenant.
   * References the 'Tenant' model. Indexed for efficient tenant-specific queries.
   * @type {mongoose.Schema.Types.ObjectId | null}
   * @ref Tenant
   * @default null
   * @index
   */
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
}, {
  /**
   * Mongoose options for the schema.
   * @property {boolean} timestamps - Automatically adds `createdAt` and `updatedAt` fields.
   */
  timestamps: true
});

/**
 * Adds a compound unique index on the 'app' and 'tenantId' fields.
 * This ensures that an 'app' name is unique within the scope of a specific 'tenantId'.
 * If 'tenantId' is null, it enforces uniqueness for 'app' names that are not associated with any tenant.
 */
AuthConfigSchema.index({ app: 1, tenantId: 1 }, { unique: true });

/**
 * Mongoose Model for AuthConfig.
 * Provides an interface to the 'authconfigs' collection in the MongoDB database.
 *
 * @class AuthConfig
 * @augments {mongoose.Model<AuthConfigDocument>}
 */
const AuthConfig = mongoose.model('AuthConfig', AuthConfigSchema);

/**
 * Exports the AuthConfig Mongoose model.
 * @type {mongoose.Model<AuthConfigDocument>}
 */
export default AuthConfig;