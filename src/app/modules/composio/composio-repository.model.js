/**
 * @file Defines the Mongoose schema and model for Composio Repositories.
 * @module models/composioRepository
 */

import mongoose from 'mongoose';
// IMPROVEMENT: Import a custom error class for consistent, structured error handling.
// This allows for better error management in the service/controller layers.
import AppError from '../../utils/AppError.js';

/**
 * @typedef {import('mongoose').Document & {
 *   name: string;
 *   description: string;
 *   license: 'MIT' | 'Apache 2.0' | 'GPL-3.0' | 'BSD-3-Clause' | 'Unlicense' | 'Other';
 *   html_url: string;
 *   clone_url: string;
 *   stars: number;
 *   forks: number;
 *   language: string;
 *   executionCount: number;
 *   workspaceId: mongoose.Schema.Types.ObjectId | null;
 *   ownerId?: mongoose.Schema.Types.ObjectId;
 *   isPublic: boolean;
 *   createdAt: Date;
 *   updatedAt: Date;
 * }} ComposioRepositoryDocument
 */

/**
 * Mongoose schema for storing information about Composio repositories.
 * These repositories are typically sourced from platforms like GitHub and represent
 * tools or integrations available through Composio.
 * @type {mongoose.Schema<ComposioRepositoryDocument>}
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

    // METRICS ENHANCEMENT: Added a field to track tool usage within a workspace.
    // This provides managers with valuable metrics on which tools are most frequently used by their team,
    // helping them understand workflow and optimize tool selection.
    /**
     * The number of times this repository (tool) has been executed or used.
     * This metric is scoped by the workspace if the repository is not public.
     * @type {number}
     * @default 0
     */
    executionCount: {
        type: Number,
        default: 0,
        min: 0 // SECURITY: Ensure count is a non-negative number.
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
    // This option automatically adds 'createdAt' and 'updatedAt' fields.
    timestamps: true
  }
);

/**
 * Creates a text index on the 'name' and 'description' fields to enable efficient
 * full-text search capabilities. The 'name' field is given a higher weight to prioritize
 * matches in the repository name over the description.
 * 'language_override: 'none'' is used to prevent stemming and stop words for more literal matching.
 */
ComposioRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

// PERFORMANCE: Add a compound index to optimize common multi-tenant queries.
// Queries will frequently filter by `workspaceId` and/or `isPublic`, and often sort by `name` or `stars`.
// This index covers the most common access pattern: finding all repositories for a workspace (private and public)
// and sorting them, which is more efficient than relying on multiple single-field indexes.
ComposioRepositorySchema.index({ workspaceId: 1, isPublic: 1, stars: -1, name: 1 });

// PERFORMANCE: Add a compound index to optimize queries for most-used tools.
// This allows managers to quickly view metrics on tool usage within their workspace,
// directly supporting the manager dashboard's metric-viewing requirements.
ComposioRepositorySchema.index({ workspaceId: 1, isPublic: 1, executionCount: -1 });

// BUSINESS LOGIC: Enforce plan limits for private repositories.
// This pre-save hook ensures that a manager or user cannot add a new private tool
// if their workspace's plan limit for custom tools has been reached. This is a critical
// feature for managing subscription tiers and preventing resource abuse.
ComposioRepositorySchema.pre('save', async function (next) {
  // We only check this for new, private repositories being added to a workspace.
  if (this.isNew && !this.isPublic && this.workspaceId) {
    try {
      // Use mongoose.model to avoid circular dependency issues if models import each other.
      const Workspace = mongoose.model('Workspace');
      
      // Find the associated workspace and populate its plan details.
      // Assumes the Workspace model has a 'plan' ref which contains 'repositoryLimit'.
      const workspace = await Workspace.findById(this.workspaceId).populate('plan');

      if (!workspace || !workspace.plan) {
        // If the workspace or plan doesn't exist, block creation to ensure data integrity.
        return next(new AppError('Cannot add repository to a workspace without a valid plan.', 400));
      }

      // A limit of -1 or null can signify an unlimited plan.
      const limit = workspace.plan.repositoryLimit;
      if (limit !== null && limit >= 0) {
        // Count existing private repositories for this workspace.
        const currentCount = await this.constructor.countDocuments({
          workspaceId: this.workspaceId,
          isPublic: false
        });

        if (currentCount >= limit) {
          // If the limit is reached, prevent the new repository from being saved.
          return next(new AppError(
            `Workspace has reached its limit of ${limit} private tools. Please upgrade your plan.`,
            403 // 403 Forbidden is appropriate for plan limit violations.
          ));
        }
      }
      
      next();
    } catch (error) {
      // Pass any unexpected errors to the next middleware.
      next(error);
    }
  } else {
    // If it's not a new private repository, skip the check.
    next();
  }
});

/**
 * The Mongoose model for a Composio Repository.
 * This model is used to interact with the 'composiorepositories' collection in MongoDB.
 * It prevents model recompilation by checking if the model already exists in `mongoose.models`.
 * @type {mongoose.Model<ComposioRepositoryDocument>}
 */
const ComposioRepository = mongoose.models.ComposioRepository || mongoose.model('ComposioRepository', ComposioRepositorySchema);

export default ComposioRepository;