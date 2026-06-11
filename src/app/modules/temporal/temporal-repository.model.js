import mongoose from 'mongoose';

/**
 * @typedef {object} TemporalRepositoryDocument
 * @property {mongoose.Schema.Types.ObjectId} workspaceId - The ID of the workspace this repository belongs to.
 * @property {mongoose.Schema.Types.ObjectId} createdBy - The ID of the user who created this repository record.
 * @property {string} name - The name of the temporal repository, unique within a workspace.
 * @property {string} [description=''] - A brief description of the repository.
 * @property {'MIT License'|'Apache License 2.0'} license - The full name of the license used by the repository.
 * @property {'mit'|'apache-2.0'} license_key - The SPDX identifier for the license.
 * @property {string} html_url - The URL to the repository's page on a web platform (e.g., GitHub).
 * @property {string} clone_url - The URL used to clone the repository (e.g., Git URL).
 * @property {number} [stars=0] - The number of stars or likes the repository has received.
 * @property {boolean} [archived=false] - Indicates if the repository is archived.
 * @property {string} local_path - The local file system path where the repository is cloned.
 * @property {'Active'|'Archived'} [status='Active'] - The operational status of the repository within the system.
 * @property {Date} createdAt - The timestamp when the repository record was created.
 * @property {Date} updatedAt - The timestamp when the repository record was last updated.
 */

/**
 * Mongoose Schema for the Temporal Repository.
 * Defines the structure and validation rules for storing information about temporal repositories.
 *
 * @type {mongoose.Schema<TemporalRepositoryDocument>}
 */
const TemporalRepositorySchema = new mongoose.Schema(
  {
    /**
     * BUG_FIX: SECURITY & INTEGRATION - Added workspaceId to enforce tenant boundaries.
     * This is critical for preventing data leakage and IDOR vulnerabilities in a multi-tenant environment.
     * All queries on this collection MUST be scoped by workspaceId.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Workspace
     * @required
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true // Indexed for efficient tenant-specific lookups.
    },
    /**
     * BUG_FIX: INTEGRATION & AUDITING - Added createdBy to track ownership and user context.
     * This is essential for role-based access control (e.g., managers viewing user's data), propagating usage details, and for auditing purposes.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    /**
     * The name of the temporal repository.
     * BUG_FIX: SECURITY - Uniqueness is now enforced at the workspace level via a compound index.
     * This allows different workspaces to use the same repository name without conflict.
     * @type {string}
     * @required
     */
    name: {
      type: String,
      required: true
      // BUG_FIX: Removed global unique:true and index:true. Replaced with a compound index {workspaceId, name}.
    },
    /**
     * A brief description of the repository.
     * @type {string}
     * @default ''
     */
    description: {
      type: String,
      default: ''
    },
    /**
     * The full name of the license used by the repository.
     * @type {'MIT License'|'Apache License 2.0'}
     * @required
     * @enum ['MIT License', 'Apache License 2.0']
     * @index
     */
    license: {
      type: String,
      required: true,
      enum: ['MIT License', 'Apache License 2.0'],
      index: true
    },
    /**
     * The SPDX identifier for the license.
     * @type {'mit'|'apache-2.0'}
     * @required
     * @enum ['mit', 'apache-2.0']
     * @index
     */
    license_key: {
      type: String,
      required: true,
      enum: ['mit', 'apache-2.0'],
      index: true
    },
    /**
     * The URL to the repository's page on a web platform (e.g., GitHub).
     * @type {string}
     * @required
     */
    html_url: {
      type: String,
      required: true
    },
    /**
     * The URL used to clone the repository (e.g., Git URL).
     * @type {string}
     * @required
     */
    clone_url: {
      type: String,
      required: true
    },
    /**
     * The number of stars or likes the repository has received.
     * @type {number}
     * @default 0
     */
    stars: {
      type: Number,
      default: 0
      // OPTIMIZATION: Removed individual index. It's now the last part of a compound index for better query performance on common filters and sorts.
    },
    /**
     * Indicates if the repository is archived.
     * @type {boolean}
     * @default false
     */
    archived: {
      type: Boolean,
      default: false
      // OPTIMIZATION: Removed individual index. It's now part of a compound index for better query performance on common filters.
    },
    /**
     * The local file system path where the repository is cloned.
     * @type {string}
     * @required
     */
    local_path: {
      type: String,
      required: true
    },
    /**
     * The operational status of the repository within the system.
     * @type {'Active'|'Archived'}
     * @enum ['Active', 'Archived']
     * @default 'Active'
     */
    status: {
      type: String,
      enum: ['Active', 'Archived'],
      default: 'Active'
      // OPTIMIZATION: Removed individual index. It's now part of a compound index for better query performance on common filters.
    }
  },
  {
    /**
     * Mongoose timestamps option.
     * Adds `createdAt` and `updatedAt` fields automatically.
     */
    timestamps: true
  }
);

// BUG_FIX: SECURITY - Added a compound unique index for name scoped to workspaceId.
// This ensures that repository names are unique within a single workspace, but can be reused across different workspaces.
TemporalRepositorySchema.index({ workspaceId: 1, name: 1 }, { unique: true });

// OPTIMIZATION: Updated compound index to include workspaceId for tenant-scoping.
// This index is optimized for queries that filter by workspace, status, and archived status,
// and then sort by the number of stars (e.g., finding active, non-archived repos in a specific workspace, sorted by popularity).
// This is more efficient than having separate indexes on each of these fields, improving read performance and reducing write overhead.
TemporalRepositorySchema.index({ workspaceId: 1, status: 1, archived: 1, stars: -1 });

/**
 * Enable full-text search index on the `name` and `description` fields.
 * Weights are assigned to prioritize matches in the name field.
 * The index is named 'TemporalTextIndex' and language override is set to 'none'.
 * NOTE: All text search queries must be accompanied by a $match on `workspaceId` to maintain tenant isolation.
 */
TemporalRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TemporalTextIndex', language_override: 'none' }
);

/**
 * Mongoose Model for the Temporal Repository.
 * Represents the 'TemporalRepository' collection in MongoDB, allowing for
 * CRUD operations and data interaction based on the defined schema.
 *
 * @type {mongoose.Model<TemporalRepositoryDocument>}
 */
const TemporalRepository = mongoose.models.TemporalRepository || mongoose.model('TemporalRepository', TemporalRepositorySchema);

/**
 * Exports the TemporalRepository Mongoose Model.
 * @module TemporalRepository
 */
export default TemporalRepository;