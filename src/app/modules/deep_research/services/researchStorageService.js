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
      index: true,
    },
    answer: {
      type: String,
      required: true,
    },
    classification: {
      type: String,
      enum: ['search', 'direct', 'deep_research'],
      required: true,
      index: true,
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
      index: true,
    },
    tags: [
      {
        type: String,
        index: true,
      },
    ],
    userId: {
      type: String,
      index: true,
    },
    conversationId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'research_results',
  }
);

// Add indexes for better query performance
researchResultSchema.index({ timestamp: -1 });
researchResultSchema.index({ classification: 1, timestamp: -1 });
researchResultSchema.index({ query: 'text', answer: 'text' });

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
      .sort({ timestamp: -1 })
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
    // Existing tenant filtering is already applied here, so no change needed for IDOR.
    const baseQuery = req ? withTenantFilter(req, {}) : {};
    const totalResults = await ResearchResult.countDocuments(baseQuery);

    const searchQuery = req
      ? withTenantFilter(req, { classification: 'search' })
      : { classification: 'search' };
    const searchResults = await ResearchResult.countDocuments(searchQuery);

    const directQuery = req
      ? withTenantFilter(req, { classification: 'direct' })
      : { classification: 'direct' };
    const directResults = await ResearchResult.countDocuments(directQuery);

    const avgTimePipeline = [
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$metadata.processingTime' },
        },
      },
    ];
    const avgTimeTenantPipeline = req
      ? withTenantPipeline(req, avgTimePipeline)
      : avgTimePipeline;
    const avgProcessingTime = await ResearchResult.aggregate(
      avgTimeTenantPipeline
    );

    const recentPipeline = [
      {
        $match: {
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
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
    ];
    const recentTenantPipeline = req
      ? withTenantPipeline(req, recentPipeline)
      : recentPipeline;
    const recentActivity = await ResearchResult.aggregate(recentTenantPipeline);

    return {
      total: totalResults,
      searchBased: searchResults,
      directResponse: directResults,
      averageProcessingTime: avgProcessingTime[0]?.avgTime || 0,
      last24Hours: recentActivity,
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

    const results = await ResearchResult.find(mongoQuery)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    const total = await ResearchResult.countDocuments(mongoQuery);

    return {
      results,
      total,
      limit,
      offset,
      hasMore: total > offset + limit,
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