/**
 * @file Defines the Mongoose schema and model for AI Endpoint configurations.
 * This model is used to store details about various AI service endpoints,
 * including their paths for adding, retrieving history, and deleting data,
 * along with multi-tenancy support.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} AiEndpointSchema
 * @property {string} title - A unique, descriptive title for the AI endpoint.
 * @property {string} nickName - A unique, short nickname for the AI endpoint, often used for internal reference.
 * @property {boolean} enabled - Indicates whether this AI endpoint is currently active and usable. Defaults to false.
 * @property {boolean} default - Indicates if this AI endpoint is the default one to be used when no specific endpoint is chosen. Defaults to false.
 * @property {string} addPath - The API path or endpoint URL for adding new data or requests to this AI service.
 * @property {string} historyPath - The API path or endpoint URL for retrieving historical data or interactions from this AI service.
 * @property {string} deletePath - The API path or endpoint URL for deleting data or resources associated with this AI service.
 * @property {mongoose.Schema.Types.ObjectId | null} tenantId - The ID of the tenant this AI endpoint belongs to. Null for global endpoints. Indexed for efficient multi-tenant queries.
 */

/**
 * Mongoose schema for an AI Endpoint.
 * Defines the structure for storing configuration details of various AI service endpoints.
 * @type {mongoose.Schema<AiEndpointSchema>}
 */
const aiEndpointSchema = new mongoose.Schema({
  /**
   * A unique, descriptive title for the AI endpoint.
   * @type {string}
   * @required
   * @unique
   */
  title: { type: String, required: true, unique: true },
  /**
   * A unique, short nickname for the AI endpoint, often used for internal reference.
   * @type {string}
   * @required
   * @unique
   */
  nickName: { type: String, required: true, unique: true },
  /**
   * Indicates whether this AI endpoint is currently active and usable.
   * @type {boolean}
   * @default false
   */
  enabled: { type: Boolean, default: false },
  /**
   * Indicates if this AI endpoint is the default one to be used when no specific endpoint is chosen.
   * @type {boolean}
   * @default false
   */
  default: { type: Boolean, default: false },
  /**
   * The API path or endpoint URL for adding new data or requests to this AI service.
   * Renamed from 'add' to 'addPath' to avoid conflicts with common method names and improve clarity.
   * @type {string}
   * @required
   */
  addPath: { type: String, required: true },
  /**
   * The API path or endpoint URL for retrieving historical data or interactions from this AI service.
   * Renamed from 'history' to 'historyPath' for similar reasons as 'addPath'.
   * @type {string}
   * @required
   */
  historyPath: { type: String, required: true },
  /**
   * The API path or endpoint URL for deleting data or resources associated with this AI service.
   * Renamed from 'delete' to 'deletePath' to avoid conflicts with the JavaScript 'delete' operator
   * and common method names, which can lead to syntax errors or unexpected behavior.
   * @type {string}
   * @required
   */
  deletePath: { type: String, required: true },

  /**
   * Multi-tenant support: The ID of the tenant this AI endpoint belongs to.
   * If null, it implies a global endpoint or one not tied to a specific tenant.
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
});

/**
 * Mongoose model for an AI Endpoint.
 * Provides an interface to the database for AI endpoint configurations.
 * @type {mongoose.Model<AiEndpointSchema>}
 */
const AiEndpoint = mongoose.model('AiEndpoint', aiEndpointSchema);

export default AiEndpoint;