import mongoose from 'mongoose';
import httpStatus from 'http-status';
import logger from '../../config/logger';
import ApiError from '../../utils/ApiError';

/**
 * @typedef {Object} ILangchainRepository
 * @property {string} name - The name of the Langchain repository.
 * @property {string} [description=''] - A brief description of the repository.
 * @property {'MIT' | 'Apache 2.0' | 'GPL-3.0' | 'BSD-3-Clause' | 'Other'} license - The license type of the repository.
 * @property {string} html_url - The HTTP URL to the repository on GitHub/GitLab.
 * @property {string} clone_url - The Git clone URL for the repository.
 * @property {number} [stars=0] - The number of stars the repository has.
 * @property {number} [forks=0] - The number of forks the repository has.
 * @property {string} [language='Unknown'] - The primary programming language of the repository.
 * @property {Date} [updated_at] - The last update timestamp from the remote repository.
 * @property {mongoose.Types.ObjectId|null} [tenantId=null] - The tenant owner of this repository (null for global/system-wide).
 * @property {boolean} [isGlobal=true] - Whether this repository is globally available to all tenants.
 * @property {boolean} [isApproved=true] - Whether this repository is approved for use (Platform Owner moderation).
 * @property {Date} createdAt - The timestamp when the document was created in the database.
 * @property {Date} updatedAt - The timestamp when the document was last updated in the database.
 */

/**
 * Mongoose schema definition for the LangchainRepository model.
 * Represents a tracked Langchain-related repository with multi-tenant and global platform owner controls.
 *
 * @type {import('mongoose').Schema<ILangchainRepository>}
 */
const LangchainRepositorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      index: true
    },
    description: {
      type: String,
      default: ''
    },
    license: {
      type: String,
      required: true,
      enum: ['MIT', 'Apache 2.0', 'GPL-3.0', 'BSD-3-Clause', 'Other'],
      default: 'Other',
      index: true
    },
    html_url: {
      type: String,
      required: true
    },
    clone_url: {
      type: String,
      required: true
    },
    stars: {
      type: Number,
      default: 0,
      // OPTIMIZATION: Indexing fields used for sorting is crucial for performance.
      index: true
    },
    forks: {
      type: Number,
      default: 0,
      // OPTIMIZATION: Indexing fields used for sorting is crucial for performance.
      index: true
    },
    language: {
      type: String,
      default: 'Unknown',
      index: true
    },
    updated_at: {
      type: Date,
      // OPTIMIZATION: Indexing fields used for sorting is crucial for performance.
      index: true
    },
    // Multi-tenancy & Platform Owner Oversight Fields
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null, // null indicates a global/system-wide repository managed by Platform Owner
      index: true
    },
    isGlobal: {
      type: Boolean,
      default: true, // Global repositories are visible to all tenants
      index: true
    },
    isApproved: {
      type: Boolean,
      default: true, // Platform Owner can approve/reject tenant-submitted repositories
      index: true
    }
  },
  {
    timestamps: true
  }
);

// OPTIMIZATION: Index timestamp fields added by `timestamps: true` for efficient sorting (e.g., "newest first").
LangchainRepositorySchema.index({ createdAt: -1 });
LangchainRepositorySchema.index({ updatedAt: -1 });

// Enable full-text search on name and description for highly relevant queries
LangchainRepositorySchema.index(
  { name: 'text', description: 'text' },
  { weights: { name: 10, description: 2 }, name: 'TextIndex', language_override: 'none' }
);

// OPTIMIZATION: Compound index to support the common `forTenant` query.
// This index covers the `isApproved` filter and the `isGlobal` part of the $or condition.
LangchainRepositorySchema.index({ isApproved: 1, isGlobal: 1 });

// OPTIMIZATION: Compound index to support the common `forTenant` query.
// This index covers the `isApproved` filter and the `tenantId` part of the $or condition.
LangchainRepositorySchema.index({ isApproved: 1, tenantId: 1 });

/**
 * Static method for Platform Owners to retrieve global statistics across all tenants.
 * @returns {Promise<Object>} Statistics object
 * @throws {ApiError} If there is a database error during the aggregation.
 */
LangchainRepositorySchema.statics.getGlobalStats = async function () {
  try {
    // OPTIMIZATION: The aggregation pipeline is the most efficient way to calculate stats on the DB side.
    const stats = await this.aggregate([
      {
        $group: {
          _id: null,
          totalRepositories: { $sum: 1 },
          globalRepositories: { $sum: { $cond: [{ $eq: ['$isGlobal', true] }, 1, 0] } },
          tenantRepositories: { $sum: { $cond: [{ $ne: ['$tenantId', null] }, 1, 0] } },
          totalStars: { $sum: '$stars' },
          totalForks: { $sum: '$forks' }
        }
      }
    ]);
    // If the aggregation returns an empty array (no documents found), provide a default object.
    return stats[0] || { totalRepositories: 0, globalRepositories: 0, tenantRepositories: 0, totalStars: 0, totalForks: 0 };
  } catch (error) {
    // Log the internal database error for telemetry and debugging.
    logger.error('Error fetching global langchain repository stats from database.', {
      errorMessage: error.message,
      errorStack: error.stack,
      context: 'LangchainRepository.getGlobalStats'
    });
    // Throw a normalized, user-friendly error to the service layer.
    // Do not expose internal database error details to the client.
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve global repository statistics due to a database error.'
    );
  }
};

/**
 * Query helper to find repositories accessible by a specific tenant.
 * Returns global repositories and repositories owned by the specific tenant.
 *
 * @param {string|mongoose.Types.ObjectId} tenantId - The tenant ID
 * @returns {mongoose.Query}
 */
LangchainRepositorySchema.query.forTenant = function (tenantId) {
  // OPTIMIZATION: This query is now supported by compound indexes on {isApproved, isGlobal} and {isApproved, tenantId},
  // which is significantly faster than relying on single-field indexes for an $or query.
  // NOTE: This is a query builder, not an async operation. Error handling belongs where this query is executed (e.g., in a service).
  return this.find({
    isApproved: true,
    $or: [{ isGlobal: true }, { tenantId: tenantId }]
  });
};

/**
 * Mongoose Model for LangchainRepository.
 * Provides database access and operations for Langchain repositories.
 *
 * @type {import('mongoose').Model<ILangchainRepository>}
 */
const LangchainRepository =
  mongoose.models.LangchainRepository || mongoose.model('LangchainRepository', LangchainRepositorySchema);

export default LangchainRepository;