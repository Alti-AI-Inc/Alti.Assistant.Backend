import mongoose from 'mongoose';
import httpStatus from 'http-status';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';

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
 * @property {'pending' | 'approved' | 'rejected'} [status='pending'] - The moderation status of the repository, controlled by the Platform Owner.
 * @property {string} [statusReason=''] - A reason provided by the Platform Owner for rejecting a repository.
 * @property {mongoose.Types.ObjectId|null} [submittedBy=null] - The user who submitted this repository.
 * @property {mongoose.Types.ObjectId|null} [lastModifiedBy=null] - The Platform Owner/admin who last changed the status.
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
      index: true
    },
    forks: {
      type: Number,
      default: 0,
      index: true
    },
    language: {
      type: String,
      default: 'Unknown',
      index: true
    },
    updated_at: {
      type: Date,
      index: true
    },
    // --- Multi-tenancy & Platform Owner Oversight Fields ---
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
    // --- PLATFORM OWNER ENHANCEMENTS: Moderation and Auditing ---
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending', // Safer default: requires explicit Platform Owner approval.
      index: true
    },
    statusReason: {
      type: String,
      default: '' // Platform Owner can provide a reason for rejection.
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Tracks which user (tenant or admin) submitted it.
      default: null,
      index: true
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Tracks the admin who last changed the status for audit purposes.
      default: null
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
// This index covers the `status` filter and the `isGlobal` part of the $or condition.
LangchainRepositorySchema.index({ status: 1, isGlobal: 1 });

// OPTIMIZATION: Compound index to support the common `forTenant` query.
// This index covers the `status` filter and the `tenantId` part of the $or condition.
LangchainRepositorySchema.index({ status: 1, tenantId: 1 });

/**
 * Static method for Platform Owners to retrieve global statistics across all tenants.
 * Provides a comprehensive overview of the repository landscape, including moderation status.
 * @returns {Promise<Object>} Statistics object
 * @throws {ApiError} If there is a database error during the aggregation.
 */
LangchainRepositorySchema.statics.getGlobalStats = async function () {
  try {
    // OPTIMIZATION: Use $facet to run multiple aggregation pipelines in a single stage for comprehensive stats.
    const results = await this.aggregate([
      {
        $facet: {
          // Pipeline 1: Calculate main counts and sums.
          mainStats: [
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
          ],
          // Pipeline 2: Count repositories by their moderation status.
          statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }]
        }
      }
    ]);

    // Safely extract results and provide defaults if no documents exist.
    const main = results[0]?.mainStats[0] || {
      totalRepositories: 0,
      globalRepositories: 0,
      tenantRepositories: 0,
      totalStars: 0,
      totalForks: 0
    };
    const statuses = results[0]?.statusCounts || [];

    // Remap the status counts array into a more developer-friendly object.
    const statusBreakdown = statuses.reduce((acc, curr) => {
      if (curr._id) {
        // e.g., creates { pendingRepositories: 10, approvedRepositories: 50 }
        acc[`${curr._id}Repositories`] = curr.count;
      }
      return acc;
    }, {});

    // Combine all stats into a single, comprehensive object for the Platform Owner dashboard.
    return {
      ...main,
      approvedRepositories: statusBreakdown.approvedRepositories || 0,
      pendingRepositories: statusBreakdown.pendingRepositories || 0,
      rejectedRepositories: statusBreakdown.rejectedRepositories || 0
    };
  } catch (error) {
    logger.error({
      // GCP Cloud Logging recognizes the 'message' field as the primary log text.
      message: 'Error fetching global langchain repository stats from database.',
      // GCP Cloud Logging automatically parses the 'severity' field.
      severity: 'ERROR',
      // Additional structured data for context and debugging.
      errorMessage: error.message,
      errorStack: error.stack,
      context: 'LangchainRepository.getGlobalStats'
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve global repository statistics due to a database error.'
    );
  }
};

/**
 * Static method for Platform Owners to retrieve a comprehensive, paginated list of all repositories.
 * This bypasses multi-tenancy rules and allows filtering by any criteria, including status,
 * providing the necessary tool for global oversight and moderation.
 *
 * @param {Object} [filters={}] - MongoDB query filters (e.g., { status: 'pending', tenantId: '...' }).
 * @param {Object} [options={}] - Query options.
 * @param {string} [options.sortBy] - Sort string in the format 'field:desc' or 'field:asc'.
 * @param {number} [options.limit=10] - Maximum number of results per page.
 * @param {number} [options.page=1] - Current page number.
 * @returns {Promise<Object>} A promise that resolves to an object with results and pagination info.
 */
LangchainRepositorySchema.statics.getPlatformOwnerView = async function (filters = {}, options = {}) {
  try {
    // Platform owner view should not be constrained by tenant or status by default.
    // The service layer will provide the filters (e.g., { status: 'pending' }).
    const sort = options.sortBy ? options.sortBy.replace(':', ' ') : '-createdAt';
    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    const countPromise = this.countDocuments(filters).exec();
    // OPTIMIZATION: Use .lean() for read-only queries. This returns plain JavaScript objects
    // instead of full Mongoose documents, which is significantly faster and uses less memory
    // as the overhead of change tracking, virtuals, and methods is skipped.
    const docsPromise = this.find(filters).sort(sort).skip(skip).limit(limit).lean().exec();

    const [totalResults, results] = await Promise.all([countPromise, docsPromise]);
    const totalPages = Math.ceil(totalResults / limit);

    return {
      results,
      page,
      limit,
      totalPages,
      totalResults
    };
  } catch (error) {
    logger.error({
      // GCP Cloud Logging recognizes the 'message' field as the primary log text.
      message: 'Error fetching platform owner view for langchain repositories.',
      // GCP Cloud Logging automatically parses the 'severity' field.
      severity: 'ERROR',
      // Additional structured data for context and debugging.
      errorMessage: error.message,
      errorStack: error.stack,
      context: 'LangchainRepository.getPlatformOwnerView',
      filters,
      options
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve repository list due to a database error.');
  }
};

/**
 * Query helper to find repositories accessible by a specific tenant.
 * Returns approved global repositories and approved repositories owned by the specific tenant.
 *
 * @param {string|mongoose.Types.ObjectId} tenantId - The tenant ID
 * @returns {mongoose.Query}
 */
LangchainRepositorySchema.query.forTenant = function (tenantId) {
  // OPTIMIZATION: This query is now supported by compound indexes on {status, isGlobal} and {status, tenantId},
  // which is significantly faster than relying on single-field indexes for an $or query.
  // NOTE: This is a query builder, not an async operation. Error handling belongs where this query is executed (e.g., in a service).
  return this.find({
    status: 'approved', // Only show approved repositories to tenants.
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