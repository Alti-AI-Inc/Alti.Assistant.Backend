/**
 * @file Defines the Mongoose schema and model for a Tool.
 * @module app/modules/composio_v2/tools.model
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} ToolSchemaDefinition
 * @property {string} slug - A unique identifier for the tool within its scope (global, tenant, or workspace). Required.
 * @property {string} name - The display name of the tool. Required.
 * @property {string} [description] - A brief description of what the tool does. Optional.
 * @property {string} [appName] - The name of the application this tool belongs to (e.g., 'Gmail', 'Slack'). Optional.
 * @property {number[]} [embedding] - A vector embedding of the tool's description/name for semantic search. Optional.
 * @property {mongoose.Schema.Types.ObjectId} [tenantId] - The ID of the tenant this tool belongs to. Null for global tools.
 * @property {mongoose.Schema.Types.ObjectId} [workspaceId] - The ID of the workspace this tool belongs to. Null for tenant-wide or global tools.
 * @property {mongoose.Schema.Types.ObjectId} [createdBy] - The ID of the user who created this tool. Null for system-provided tools.
 * @property {Date} createdAt - Timestamp of when the document was created.
 * @property {Date} updatedAt - Timestamp of when the document was last updated.
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
     * @fix [Bug] Uniqueness is now enforced via a compound index to prevent collisions at the correct scope.
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

    /**
     * @fix [Integration] Added to support workspace-level tool management and respect role boundaries (e.g., workspace owner).
     * If null, the tool is tenant-wide (if tenantId is set) or global (if tenantId is also null).
     * This field is crucial for scoping tools and permissions correctly within the platform hierarchy.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Workspace
     * @default null
     * @index true
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      default: null,
      index: true,
    },

    /**
     * @fix [Integration] Added to track tool ownership, enabling role-based access control (e.g., only admins or the creator can modify a tool).
     * This is crucial for propagating actions and maintaining a clear audit trail up the management chain.
     * If null, the tool is considered a system-provided or global default tool.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @default null
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    /**
     * Allows additional fields not explicitly defined in the schema to be stored.
     * This is useful for accommodating varying data structures from external sources like Composio.
     * @type {boolean}
     */
    strict: false, // Allow additional fields that might come from Composio
    /**
     * @fix [Bug] Added timestamps to track creation and updates, which is essential for auditing, cache invalidation, and debugging integration issues.
     */
    timestamps: true,
  }
);

/**
 * @fix [Bug] Added a compound unique index to prevent slug collisions within the correct scope.
 * A tool's slug must be unique within its workspace, or if not in a workspace, within its tenant,
 * or if not in a tenant, globally. This enforces data integrity and prevents ambiguity when referencing tools.
 */
ToolSchema.index({ workspaceId: 1, tenantId: 1, slug: 1 }, { unique: true });

/**
 * Mongoose model for a Tool.
 * Provides an interface to interact with the 'tools' collection in MongoDB.
 *
 * @type {mongoose.Model<ToolSchemaDefinition>}
 */
const Tool = mongoose.model('Tool', ToolSchema);

export default Tool;