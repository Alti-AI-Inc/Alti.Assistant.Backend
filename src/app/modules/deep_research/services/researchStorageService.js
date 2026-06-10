import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import { connectToMongoDB } from '../utils/mongodb-connection.js';
import config from '../../../../../config/index.js';
import {
  withTenantPipeline,
  withTenantFilter,
} from '../../../helpers/tenantQuery.js';

// Initialize GCS storage client with offline safety bounds
let storage = null;
try {
  storage = new Storage({
    projectId: config.google?.gcp_project_id || process.env.GCP_PROJECT_ID,
    keyFilename: 'alti_gcp.json',
  });
} catch (gcsInitErr) {
  console.warn('⚠️ Google Cloud Storage client initialization bypassed:', gcsInitErr.message);
}

const DEEP_RESEARCH_BUCKET = 'alti_assistant_reports';

// Ensure MongoDB connection using the config URI
connectToMongoDB(config.database_local).catch(console.error);

// Define the research result schema
const researchResultSchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      // PERFORMANCE: Removed redundant single-field index, which is covered by the text index below.
    },
    answer: {
      type: String,
      required: true,
    },
    classification: {
      type: String,
      enum: ['search', 'direct', 'deep_research'],
      required: true,
      // PERFORMANCE: Removed redundant single-field index, covered by more specific compound indexes.
    },
    sources: [
      {
        id: Number,
        title: String,
        url: String,
        snippet: String,
      },
    ],
    quantitativeFacts: [
      {
        metric: String,
        value: String,
        source: String,
        url: String,
        trustLevel: String,
        verificationScore: Number,
      },
    ],
    metadata: {
      queryType: String,
      processingTime: Number,
      // BUG FIX: Removed redundant 'timestamp' field from metadata.
      // The top-level 'timestamp' and Mongoose's 'createdAt'/'updatedAt'
      // (from timestamps: true) provide sufficient timestamping.
      confidence: Number,
      savedId: String,
      saveError: String,
    },
    gcsPdfUrl: {
      type: String
    },
    gcsTopologyUrl: {
      type: String
    },
    timestamp: {
      type: Date,
      default: Date.now,
      // PERFORMANCE: Removed redundant single-field index, covered by more specific compound indexes.
    },
    tags: [
      {
        type: String,
        index: true, // PERFORMANCE: Keep index on tags for efficient $in queries.
      },
    ],
    userId: {
      type: String,
      // PERFORMANCE: Removed redundant single-field index, covered by more specific compound indexes.
    },
    conversationId: {
      type: String,
      // PERFORMANCE: Removed redundant single-field index, covered by more specific compound indexes.
    },
  },
  {
    timestamps: true,
    collection: 'research_results',
  }
);

// PERFORMANCE: Consolidated and optimized indexes for common query patterns.
// Text index for free-text search.
researchResultSchema.index({ query: 'text', answer: 'text' });
// Index for general-purpose sorting and filtering by time (e.g., global recent results).
researchResultSchema.index({ timestamp: -1 });
// Index for filtering by classification and sorting by time (useful for stats).
researchResultSchema.index({ classification: 1, timestamp: -1 });
// Index for user-specific queries sorted by time (e.g., recent results for a user).
researchResultSchema.index({ userId: 1, timestamp: -1 });
// Index for fetching a specific conversation's history for a user.
researchResultSchema.index({ userId: 1, conversationId: 1, timestamp: 1 });
// A general-purpose index for the main search function, covering common user-based filters.
researchResultSchema.index({ userId: 1, classification: 1, timestamp: -1 });


// Create the model
const ResearchResult = mongoose.model('ResearchResult', researchResultSchema);

/**
 * Save a research result to MongoDB
 * @param {object} resultData - The data for the research result.
 */
export const saveResearchResult = async (resultData) => {
  try {
    // SECURITY NOTE: Ensure userId and tenantId are securely set from the authenticated user context
    // before saving to prevent data ownership issues. This service assumes resultData
    // already contains userId and conversationId, but a robust implementation would
    // validate/inject these from the request's authenticated user.
    const researchResult = new ResearchResult(resultData);
    const savedResult = await researchResult.save();
    console.log('Research result saved successfully:', savedResult._id);
    return savedResult;
  } catch (error) {
    console.error('Error saving research result:', error);
    throw error;
  }
};

/**
 * Retrieve research results by query
 * @param {string} query - The search query string.
 * @param {number} limit - The maximum number of results to return.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const getResearchResultsByQuery = async (query, limit = 10, req) => {
  try {
    // SECURITY FIX: Apply tenant filter to prevent Insecure Direct Object Reference (IDOR).
    // Ensures users can only query results belonging to their tenant/user context.
    const tenantFilteredQuery = withTenantFilter(req, { $text: { $search: query } });

    const results = await ResearchResult.find(tenantFilteredQuery)
      .sort({ score: { $meta: 'textScore' } }) // PERFORMANCE: Sort by text search relevance score.
      .limit(limit)
      .lean();

    return results;
  } catch (error) {
    console.error('Error retrieving research results by query:', error);
    throw error;
  }
};

/**
 * Retrieve recent research results
 * @param {number} limit - The maximum number of results to return.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const getRecentResearchResults = async (limit = 20, req) => {
  try {
    // SECURITY FIX: Apply tenant filter to prevent Insecure Direct Object Reference (IDOR).
    // Ensures users can only view recent results belonging to their tenant/user context.
    const tenantFilteredQuery = withTenantFilter(req, {});

    // PERFORMANCE: This query is optimized by the { userId: 1, timestamp: -1 } index.
    const results = await ResearchResult.find(tenantFilteredQuery)
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('query classification timestamp metadata.processingTime')
      .lean();

    return results;
  } catch (error) {
    console.error('Error retrieving recent research results:', error);
    throw error;
  }
};

/**
 * Get research result by ID
 * @param {string} id - The ID of the research result.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const getResearchResultById = async (id, req) => {
  try {
    // SECURITY FIX: Apply tenant filter to prevent Insecure Direct Object Reference (IDOR).
    // Ensures users can only access results belonging to their tenant/user context.
    // Changed from findById to findOne to allow merging with tenant filter.
    const tenantFilteredQuery = withTenantFilter(req, { _id: id });
    const result = await ResearchResult.findOne(tenantFilteredQuery).lean();
    return result;
  } catch (error) {
    console.error('Error retrieving research result by ID:', error);
    throw error;
  }
};

/**
 * Get research results by conversation ID
 * @param {string} conversationId - The ID of the conversation.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const getResearchResultsByConversation = async (conversationId, req) => {
  try {
    // SECURITY FIX: Apply tenant filter to prevent Insecure Direct Object Reference (IDOR).
    // Ensures users can only access results belonging to their tenant/user context.
    const tenantFilteredQuery = withTenantFilter(req, { conversationId });

    // PERFORMANCE: This query is optimized by the { userId: 1, conversationId: 1, timestamp: 1 } index.
    const results = await ResearchResult.find(tenantFilteredQuery)
      .sort({ timestamp: 1 })
      .lean();

    return results;
  } catch (error) {
    console.error('Error retrieving research results by conversation:', error);
    throw error;
  }
};

/**
 * Delete research result by ID
 * @param {string} id - The ID of the research result to delete.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const deleteResearchResult = async (id, req) => {
  try {
    // SECURITY FIX: Apply tenant filter to prevent Insecure Direct Object Reference (IDOR).
    // Ensures users can only delete results belonging to their tenant/user context.
    // Changed from findByIdAndDelete to findOneAndDelete to allow merging with tenant filter.
    const tenantFilteredQuery = withTenantFilter(req, { _id: id });
    const result = await ResearchResult.findOneAndDelete(tenantFilteredQuery);
    return result;
  } catch (error) {
    console.error('Error deleting research result:', error);
    throw error;
  }
};

/**
 * Get research statistics
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const getResearchStatistics = async (req = null) => {
  try {
    // PERFORMANCE: Replaced 5 separate DB calls with a single, more efficient aggregation pipeline using $facet.
    // This reduces network overhead and database load.
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const statsPipeline = [
      {
        $facet: {
          // Stage 1: Get counts for each classification and total count.
          counts: [
            {
              $group: {
                _id: '$classification',
                count: { $sum: 1 },
              },
            },
          ],
          // Stage 2: Calculate average processing time.
          avgProcessingTime: [
            {
              $match: {
                'metadata.processingTime': { $exists: true, $ne: null },
              },
            },
            {
              $group: {
                _id: null,
                avgTime: { $avg: '$metadata.processingTime' },
              },
            },
          ],
          // Stage 3: Get activity in the last 24 hours, grouped by hour.
          recentActivity: [
            {
              $match: {
                timestamp: { $gte: twentyFourHoursAgo },
              },
            },
            {
              $group: {
                _id: { $hour: '$timestamp' },
                count: { $sum: 1 },
              },
            },
            {
              $sort: { _id: 1 },
            },
          ],
        },
      },
    ];

    // Apply tenant filtering at the beginning of the pipeline if a request object is provided.
    const tenantPipeline = req
      ? withTenantPipeline(req, statsPipeline)
      : statsPipeline;

    const results = await ResearchResult.aggregate(tenantPipeline);

    if (!results || results.length === 0) {
      return {
        total: 0,
        searchBased: 0,
        directResponse: 0,
        averageProcessingTime: 0,
        last24Hours: [],
      };
    }

    const stats = results[0];
    const classificationCounts = stats.counts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const total = stats.counts.reduce((sum, item) => sum + item.count, 0);

    return {
      total: total,
      searchBased: classificationCounts.search || 0,
      directResponse: classificationCounts.direct || 0,
      averageProcessingTime: stats.avgProcessingTime[0]?.avgTime || 0,
      last24Hours: stats.recentActivity,
    };
  } catch (error) {
    console.error('Error getting research statistics:', error);
    throw error;
  }
};

/**
 * Add tags to a research result
 * @param {string} id - The ID of the research result.
 * @param {string[]} tags - An array of tags to add.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const addTagsToResult = async (id, tags, req) => {
  try {
    // SECURITY FIX: Apply tenant filter to prevent Insecure Direct Object Reference (IDOR).
    // Ensures users can only modify results belonging to their tenant/user context.
    // Changed from findByIdAndUpdate to findOneAndUpdate to allow merging with tenant filter.
    const tenantFilteredQuery = withTenantFilter(req, { _id: id });
    const result = await ResearchResult.findOneAndUpdate(
      tenantFilteredQuery,
      { $addToSet: { tags: { $each: tags } } },
      { new: true }
    );
    return result;
  } catch (error) {
    console.error('Error adding tags to research result:', error);
    throw error;
  }
};

/**
 * Search research results with filters
 * @param {object} filters - An object containing search filters.
 * @param {object} req - The Express request object, used for tenant filtering.
 */
export const searchResearchResults = async (filters = {}, req) => {
  try {
    const {
      query,
      classification,
      startDate,
      endDate,
      tags,
      userId, // This userId filter should be applied *in addition* to the tenant filter from req.
      limit = 20,
      offset = 0,
    } = filters;

    // SECURITY FIX: Initialize mongoQuery with tenant filter to prevent IDOR.
    // This ensures all search results are scoped to the user's tenant.
    let mongoQuery = withTenantFilter(req, {});

    if (query) {
      mongoQuery.$text = { $search: query };
    }

    if (classification) {
      mongoQuery.classification = classification;
    }

    if (startDate || endDate) {
      mongoQuery.timestamp = mongoQuery.timestamp || {}; // Ensure timestamp object exists
      if (startDate) mongoQuery.timestamp.$gte = new Date(startDate);
      if (endDate) mongoQuery.timestamp.$lte = new Date(endDate);
    }

    if (tags && tags.length > 0) {
      mongoQuery.tags = { $in: tags };
    }

    // If a userId is provided in filters, it should further restrict the results
    // within the tenant's scope, not override it.
    if (userId) {
      mongoQuery.userId = userId;
    }

    // PERFORMANCE: Replaced find() + countDocuments() with a single aggregation pipeline using $facet.
    // This is more efficient as it requires only one round trip to the database.
    const pipeline = [
      { $match: mongoQuery },
      {
        $facet: {
          // Paginated results
          results: [
            // If it's a text search, sort by relevance, otherwise by time.
            { $sort: query ? { score: { $meta: 'textScore' } } : { timestamp: -1 } },
            { $skip: offset },
            { $limit: limit },
          ],
          // Total count for pagination
          totalCount: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ];

    const aggregationResult = await ResearchResult.aggregate(pipeline);

    // The result of a $facet aggregation is an array with a single document.
    const data = aggregationResult[0];
    const results = data.results;
    const total = data.totalCount[0]?.count || 0;

    return {
      results,
      total,
      limit,
      offset,
      hasMore: total > offset + results.length,
    };
  } catch (error) {
    console.error('Error searching research results:', error);
    throw error;
  }
};

export const publishDeepResearchToGCS = async (pdfBuffer, filename, topologyData, userId = 'guest_user', conversationId = 'default_conv') => {
  if (!storage) {
    console.warn('ℹ️ GCS Storage client not active, skipping cloud publishing');
    return { success: false, reason: 'GCS client inactive' };
  }

  try {
    const bucket = storage.bucket(DEEP_RESEARCH_BUCKET);
    
    // 1. Upload PDF
    let gcsPdfUrl = null;
    if (pdfBuffer) {
      const pdfPath = `${userId}/${conversationId}/${filename}`;
      const pdfFile = bucket.file(pdfPath);
      await pdfFile.save(pdfBuffer, {
        metadata: { contentType: 'application/pdf' },
        resumable: false
      });
      gcsPdfUrl = `https://storage.googleapis.com/${DEEP_RESEARCH_BUCKET}/${pdfPath}`;
      console.log(`✓ Strategy PDF published to GCS: ${gcsPdfUrl}`);
    }

    // 2. Upload Topology Graph
    let gcsTopologyUrl = null;
    if (topologyData) {
      const topologyFilename = filename.replace('.pdf', '_topology.json');
      const topologyPath = `${userId}/${conversationId}/${topologyFilename}`;
      const topologyFile = bucket.file(topologyPath);
      await topologyFile.save(Buffer.from(JSON.stringify(topologyData, null, 2)), {
        metadata: { contentType: 'application/json' },
        resumable: false
      });
      gcsTopologyUrl = `https://storage.googleapis.com/${DEEP_RESEARCH_BUCKET}/${topologyPath}`;
      console.log(`✓ Knowledge Topology published to GCS: ${gcsTopologyUrl}`);
    }

    return {
      success: true,
      gcsPdfUrl,
      gcsTopologyUrl
    };
  } catch (err) {
    console.warn('⚠️ GCS Cloud publishing failed (offline sandbox tolerance active):', err.message);
    return { success: false, error: err.message };
  }
};

export { ResearchResult };