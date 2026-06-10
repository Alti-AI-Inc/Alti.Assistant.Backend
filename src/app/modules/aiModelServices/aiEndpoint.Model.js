/**
 * @file Defines the Mongoose schema and model for AI Endpoint configurations.
 * This model is used to store details about various AI service endpoints,
 * including their base URLs, paths, and other configurations.
 * It supports multi-tenancy and provides special fields for Platform Owner oversight.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} AiEndpointSchema
 * @property {string} title - A descriptive title for the AI endpoint. Must be unique per tenant.
 * @property {string} nickName - A short nickname for the AI endpoint, often used for internal reference. Must be unique per tenant.
 * @property {string} [description] - An optional description of the endpoint's purpose or configuration.
 * @property {boolean} enabled - Indicates whether this AI endpoint is currently active and usable. Defaults to false.
 * @property {boolean} default - Indicates if this is the default endpoint for the tenant. Defaults to false.
 * @property {boolean} isPlatformOwned - If true, this is a global endpoint managed by the Platform Owner and cannot be modified by tenants. Defaults to false.
 * @property {string} baseUrl - The base URL for the AI service API (e.g., 'https://api.openai.com/v1').
 * @property {string} modelIdentifier - The specific model identifier this endpoint targets (e.g., 'gpt-4-turbo', 'claude-3-opus-20240229'). Indexed for performance.
 * @property {string} addPath - The relative API path for adding new data or requests (e.g., '/chat/completions').
 * @property {string} historyPath - The relative API path for retrieving historical data or interactions.
 * @property {string} deletePath - The relative API path for deleting data or resources.
 * @property {object} [config] - A flexible object for storing additional configuration like custom headers, rate limits, or timeouts.
 * @property {Map<string, string>} [config.headers] - Custom headers to be sent with requests to this endpoint.
 * @property {object} [config.rateLimit] - Defines rate limiting for this specific endpoint.
 * @property {number} [config.rateLimit.requests] - Number of requests allowed.
 * @property {number} [config.rateLimit.perSeconds] - The time window in seconds for the request limit.
 * @property {number} [config.timeoutMs] - Request timeout in milliseconds.
 * @property {object} [platformConfigOverrides] - Platform Owner exclusive settings that override the standard 'config' and 'enabled' fields.
 * @property {Map<string, string>} [platformConfigOverrides.headers] - Overriding headers.
 * @property {object} [platformConfigOverrides.rateLimit] - Overriding rate limits.
 * @property {number} [platformConfigOverrides.rateLimit.requests] - Overriding number of requests.
 * @property {number} [platformConfigOverrides.rateLimit.perSeconds] - Overriding time window.
 * @property {number} [platformConfigOverrides.timeoutMs] - Overriding request timeout.
 * @property {boolean} [platformConfigOverrides.forceDisable] - If true, disables the endpoint regardless of the 'enabled' flag. A powerful tool for immediate suspension.
 * @property {mongoose.Schema.Types.ObjectId | null} tenantId - The ID of the tenant this endpoint belongs to. Null for global, platform-owned endpoints.
 * @property {Date} createdAt - Timestamp of when the document was created.
 * @property {Date} updatedAt - Timestamp of when the document was last updated.
 */

/**
 * Mongoose schema for an AI Endpoint.
 * Defines the structure for storing configuration details of various AI service endpoints.
 * @type {mongoose.Schema<AiEndpointSchema>}
 */
const aiEndpointSchema = new mongoose.Schema({
  /**
   * A descriptive title for the AI endpoint.
   * Uniqueness is enforced per tenant via a compound index.
   * @type {string}
   * @required
   */
  title: { type: String, required: true },
  /**
   * A short nickname for the AI endpoint, often used for internal reference.
   * Uniqueness is enforced per tenant via a compound index.
   * @type {string}
   * @required
   */
  nickName: { type: String, required: true },
  /**
   * An optional description of the endpoint's purpose or configuration.
   * @type {string}
   */
  description: { type: String },
  /**
   * Indicates whether this AI endpoint is currently active and usable.
   * Can be overridden by the Platform Owner via `platformConfigOverrides.forceDisable`.
   * @type {boolean}
   * @default false
   */
  enabled: { type: Boolean, default: false },
  /**
   * Indicates if this is the default endpoint for the tenant.
   * Logic should ensure only one endpoint per tenant is the default.
   * @type {boolean}
   * @default false
   */
  default: { type: Boolean, default: false },
  /**
   * A flag for Platform Owner control. If true, this is a global/system-level endpoint.
   * Tenants can use these but typically cannot edit or delete them.
   * @type {boolean}
   * @default false
   * @index
   */
  isPlatformOwned: { type: Boolean, default: false, index: true },
  /**
   * The base URL for the AI service API.
   * @type {string}
   * @required
   */
  baseUrl: { type: String, required: true },
  /**
   * The specific model identifier this endpoint targets (e.g., 'gpt-4-turbo').
   * Essential for application logic to know which model to use.
   * @type {string}
   * @required
   * @index
   */
  modelIdentifier: { type: String, required: true, index: true },
  /**
   * The relative API path for adding new data or requests to this AI service.
   * @type {string}
   * @required
   */
  addPath: { type: String, required: true },
  /**
   * The relative API path for retrieving historical data or interactions from this AI service.
   * @type {string}
   * @required
   */
  historyPath: { type: String, required: true },
  /**
   * The relative API path for deleting data or resources associated with this AI service.
   * @type {string}
   * @required
   */
  deletePath: { type: String, required: true },
  /**
   * A flexible object for storing additional, endpoint-specific configuration.
   * Can be superseded by `platformConfigOverrides`.
   * @type {object}
   */
  config: {
    type: {
      headers: { type: Map, of: String },
      rateLimit: {
        requests: { type: Number },
        perSeconds: { type: Number },
      },
      timeoutMs: { type: Number },
    },
    default: {},
  },
  /**
   * Platform Owner exclusive configuration overrides.
   * These settings, when present, take precedence over the standard 'config' object and 'enabled' field.
   * This allows a Super Admin to temporarily adjust limits, add debug headers, or enforce
   * platform-wide policies on any endpoint without modifying the tenant's original configuration.
   * This field is not selected by default in queries to prevent leaking sensitive override
   * information to non-admin users.
   * @type {object}
   */
  platformConfigOverrides: {
    type: {
      headers: { type: Map, of: String },
      rateLimit: {
        requests: { type: Number },
        perSeconds: { type: Number },
      },
      timeoutMs: { type: Number },
      /**
       * If true, this endpoint is disabled regardless of the `enabled` field's value.
       * This provides a powerful and immediate way for a Platform Owner to suspend a
       * specific problematic endpoint for any tenant.
       */
      forceDisable: { type: Boolean },
    },
    default: {},
    select: false, // Hide from default query results for security. Admins must explicitly request it.
  },
  /**
   * Multi-tenant support: The ID of the tenant this AI endpoint belongs to.
   * If null, it implies a global endpoint managed by the Platform Owner.
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
   * Automatically adds `createdAt` and `updatedAt` fields.
   * Crucial for global auditing and oversight by the Platform Owner.
   */
  timestamps: true,
});

/**
 * Compound index to ensure that `title` is unique per tenant.
 * A null `tenantId` is treated as a single value, ensuring uniqueness among global endpoints.
 */
aiEndpointSchema.index({ tenantId: 1, title: 1 }, { unique: true });

/**
 * Compound index to ensure that `nickName` is unique per tenant.
 */
aiEndpointSchema.index({ tenantId: 1, nickName: 1 }, { unique: true });

/**
 * Indexes to optimize common multi-tenant queries.
 */
aiEndpointSchema.index({ tenantId: 1, enabled: 1 });
aiEndpointSchema.index({ tenantId: 1, default: 1 });

/**
 * Mongoose model for an AI Endpoint.
 * Provides an interface to the database for AI endpoint configurations.
 * @type {mongoose.Model<AiEndpointSchema>}
 */
const AiEndpoint = mongoose.model('AiEndpoint', aiEndpointSchema);

export default AiEndpoint;