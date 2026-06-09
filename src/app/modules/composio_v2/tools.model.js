/**
 * @file Defines the Mongoose schema and model for a Tool.
 * @module app/modules/composio_v2/tools.model
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} ToolSchemaDefinition
 * @property {string} slug - A unique identifier for the tool. Required.
 * @property {string} name - The display name of the tool. Required.
 * @property {string} [description] - A brief description of what the tool does. Optional.
 * @property {string} [appName] - The name of the application this tool belongs to (e.g., 'Gmail', 'Slack'). Optional.
 * @property {number[]} [embedding] - A vector embedding of the tool's description/name for semantic search. Optional.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId] - The ID of the tenant this tool belongs to. Used for multi-tenancy.
 *                                                         Defaults to null for global tools. Indexed for efficient lookup.
 */

/**
 * Mongoose Schema for a Tool.
 * Represents a tool available through the Composio integration, including its metadata and an optional vector embedding.
 *
 * @type {mongoose.Schema<ToolSchemaDefinition>}
 */
const ToolSchema = mongoose.Schema(
  {
    /**
     * A unique, URL-friendly identifier for the tool.
     * @type {string}
     * @required
     */
    slug: {
      type: String,
      required: true,
    },
    /**
     * The human-readable name of the tool.
     * @type {string}
     * @required
     */
    name: {
      type: String,
      required: true,
    },
    /**
     * A detailed description of the tool's functionality.
     * @type {string}
     * @optional
     */
    description: {
      type: String,
      required: false,
    },
    /**
     * The name of the application or service this tool is part of.
     * @type {string}
     * @optional
     */
    appName: {
      type: String,
      required: false,
    },
    /**
     * A numerical vector representation of the tool's description, used for vector search.
     * Note: Vector index should be created in MongoDB Atlas, not defined directly in the schema.
     * @type {number[]}
     * @optional
     */
    embedding: {
      type: [Number],
      required: false,
    },

    /**
     * Identifier for multi-tenant support. Links the tool to a specific tenant.
     * If null, the tool is considered global or not tenant-specific.
     * @type {mongoose.Schema.Types.ObjectId}
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
  },
  {
    /**
     * Allows additional fields not explicitly defined in the schema to be stored.
     * This is useful for accommodating varying data structures from external sources like Composio.
     * @type {boolean}
     */
    strict: false, // Allow additional fields that might come from Composio
  }
);

/**
 * Mongoose model for a Tool.
 * Provides an interface to interact with the 'tools' collection in MongoDB.
 *
 * @type {mongoose.Model<ToolSchemaDefinition>}
 */
const Tool = mongoose.model('Tool', ToolSchema);

export default Tool;