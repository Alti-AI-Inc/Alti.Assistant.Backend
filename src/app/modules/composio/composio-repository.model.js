/**
 * @file Defines the Mongoose schema and model for Composio Repositories.
 * @module models/composioRepository
 */

import mongoose from 'mongoose';

/**
 * Mongoose schema for storing information about Composio repositories.
 * These repositories are typically sourced from platforms like GitHub and represent
 * tools or integrations available through Composio.
 * @class ComposioRepositorySchema
 * @type {mongoose.Schema}
 */
const ComposioRepositorySchema = new mongoose.Schema(
  {
    /**
     * The name of the repository.
     * @type {string}
     * @required
     * @indexed
     */
    name: {
      type: String,
      required: true,
      index: true,
      trim: true, // SECURITY: Trim whitespace to ensure data consistency.
      // SECURITY: Sanitize input to prevent stored XSS by stripping any potential HTML tags.
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>?/gm, '') : v)
    },
    /**
     * A brief description of the repository's purpose.
     * @type {string}
     * @default ''
     */
    description: {
      type: String,
      default: '',
      trim: true, // SECURITY: Trim whitespace to ensure data consistency.
      // SECURITY: Sanitize input to prevent stored XSS by stripping any potential HTML tags.
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>?/gm, '') : v)
    },
    /**
     * The software license under which the repository is distributed.
     * @type {string}
     * @required
     * @enum ['MIT', 'Apache 2.0', 'GPL-3.0', 'BSD-3-Clause', 'Unlicense', 'Other']
     * @indexed
     */
    license: {
      type: String,
      required: true,
      // BUGFIX: Expanded enum to include more common licenses and an 'Other' option.
      // The original enum was too restrictive and would cause validation errors for many valid repositories.
      enum: ['MIT', 'Apache 2.0', 'GPL-3.0', 'BSD-3-Clause', 'Unlicense', 'Other'],
      index: true
    },
    /**
     * The web URL to the repository's main page (e.g., on GitHub).
     * @type {string}
     * @required
     */
    html_url: {
      type: String,
      required: true,
      trim: true, // SECURITY: Trim whitespace from URL.
      // SECURITY: Add validation to ensure the input conforms to a URL format.
      match: [/^(https|http):\/\/[^ "]+$/, 'Please provide a valid URL for html_url']
    },
    /**
     * The URL used to clone the repository via Git.
     * @type {string}
     * @required
     */
    clone_url: {
      type: String,
      required: true,
      trim: true, // SECURITY: Trim whitespace from URL.
      // SECURITY: Add validation to ensure the input conforms to a URL format (git, ssh, http, https).
      match: [/^(https|http|git|ssh):\/\/[^ "]+$/, 'Please provide a valid URL for clone_url']
    },
    /**
     * The number of stars the repository has received.
     * @type {number}
     * @default 0
     */
    stars: {
      type: Number,
      default: 0,
      min: 0 // SECURITY: Add validation to ensure star count is a non-negative number.
    },
    /**
     * The number of times the repository has been forked.
     * @type {number}
     * @default 0
     */
    forks: {
      type: Number,
      default: 0,
      min: 0 // SECURITY: Add validation to ensure fork count is a non-negative number.
    },
    /**
     * The primary programming language of the repository.
     * @type {string}
     * @default 'Unknown'
     * @indexed
     */
    language: {
      type: String,
      default: 'Unknown',
      index: true,
      trim: true // SECURITY: Trim whitespace to ensure data consistency.
    },

    // HIERARCHY & TENANCY FIX: Added fields to support multi-tenancy and ownership.
    // The original schema lacked any concept of workspace or user ownership, making it impossible
    // to enforce tenant boundaries or track actions, which is a critical security and integration gap.

    /**
     * The ID of the workspace this repository is associated with.
     * This is crucial for enforcing tenant data isolation.
     * It is null for global repositories (isPublic: true) managed by super_admins.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Workspace
     * @indexed
     */
    workspaceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        index: true,
        // A repository must be associated with a workspace if it's not public.
        // This enforces data integrity for tenant-specific resources.
        required: function() {
            return this.isPublic === false;
        },
        default: null
    },

    /**
     * The ID of the user (e.g., admin, manager) who added this repository.
     * Essential for auditing, permissions, and propagating usage information up the hierarchy.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     */
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // May be null for repositories seeded by the system.
    },

    /**
     * Flag indicating if the repository is globally available to all workspaces.
     * `true` for repositories added by a super_admin for platform-wide use.
     * `false` for repositories specific to a single workspace.
     * @type {boolean}
     * @default false
     * @indexed
     */
    isPublic: {
        type: Boolean,
        default: false,
        index: true
    }
  },
  {
    /**
     * Mongoose schema options.
     * @property {boolean} timestamps - If true, Mongoose adds createdAt and updatedAt properties to the schema.
     */
    timestamps: true // This option automatically adds 'createdAt' and 'updatedAt' fields.
  }
);

/**
 * Creates a text index on the 'name' and 'description' fields to enable efficient
 * full-text search capabilities. The 'name' field is given a higher weight to prioritize
 * matches in the repository name over the description.
 * 'language_override: 'none'' is used to prevent stemming and stop words for more literal matching.
 */
// Enable full-text search on name and description for highly relevant queries
ComposioRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

/**
 * The Mongoose model for a Composio Repository.
 * This model is used to interact with the 'composiorepositories' collection in MongoDB.
 * It prevents model recompilation by checking if the model already exists in `mongoose.models`.
 * @model ComposioRepository
 * @type {mongoose.Model<ComposioRepositorySchema>}
 */
const ComposioRepository = mongoose.models.ComposioRepository || mongoose.model('ComposioRepository', ComposioRepositorySchema);

export default ComposioRepository;