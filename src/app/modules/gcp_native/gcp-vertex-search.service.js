import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Queries a Vertex AI Search & Conversation (Discovery Engine) semantic data store.
 * 
 * @param {string} dataStoreId - Discovery Engine Data Store ID
 * @param {string} query - Search query string
 * @param {object} [options] - Additional search arguments (pageSize, filter, location)
 * @returns {Promise<object>} Discovery Engine structured search results
 */
const searchDataStore = async (dataStoreId, query, options = {}) => {
  try {
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = options.location || config.google.gcp_location || process.env.GCP_LOCATION || 'global';
    const pageSize = options.pageSize || 10;
    const filter = options.filter || '';

    if (!projectId) {
      throw new Error('GCP Project ID is not configured.');
    }

    if (!dataStoreId) {
      throw new Error('Discovery Engine Data Store ID is required.');
    }

    if (!query) {
      return {
        success: true,
        originalQuery: '',
        results: []
      };
    }

    logger.info(`GCP Vertex Search: Querying data store "${dataStoreId}" under project "${projectId}" (location: ${location})...`);

    const client = await auth.getClient();
    const endpoint = `https://discoveryengine.googleapis.com/v1beta/projects/${projectId}/locations/${location}/dataStores/${dataStoreId}/branches/default_branch/documents:search`;

    const requestBody = {
      query: query,
      pageSize: Math.min(pageSize, 100)
    };

    if (filter) {
      requestBody.filter = filter;
    }

    const response = await client.request({
      url: endpoint,
      method: 'POST',
      data: requestBody
    });

    const searchResponse = response.data || {};
    const results = (searchResponse.results || []).map((res, index) => {
      const doc = res.document || {};
      const fields = doc.derivedStructData || doc.structData || {};
      
      return {
        id: doc.id,
        name: doc.name,
        title: fields.title || doc.id || 'Untitled Document',
        snippet: fields.snippet || fields.description || '',
        link: fields.link || fields.uri || '',
        relevanceScore: res.relevanceScore || 1.0 - (index * 0.05),
        index: index + 1
      };
    });

    logger.info(`GCP Vertex Search: Successfully retrieved ${results.length} semantic grounding documents.`);

    return {
      success: true,
      originalQuery: query,
      dataStoreId: dataStoreId,
      totalCount: results.length,
      results: results
    };
  } catch (err) {
    logger.error('GCP Vertex Search Query Error:', err);
    // Return empty results array to prevent crashing workflows, keeping service resilient
    return {
      success: false,
      originalQuery: query,
      dataStoreId: dataStoreId,
      error: err.message,
      results: []
    };
  }
};

export const GcpVertexSearchService = {
  searchDataStore
};
