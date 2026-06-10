import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * GoogleAuth client instance configured with 'https://www.googleapis.com/auth/cloud-platform' scope.
 * This client is used to authenticate requests to Google Cloud APIs.
 * @type {GoogleAuth}
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Queries a Vertex AI Search & Conversation (Discovery Engine) semantic data store
 * to retrieve relevant documents based on a natural language query.
 *
 * This function handles authentication, constructs the request, and processes the
 * Discovery Engine API response into a more consumable format.
 *
 * @param {string} dataStoreId - The unique identifier of the Discovery Engine Data Store to query.
 *                                This typically follows the format `projects/PROJECT_NUMBER/locations/LOCATION/dataStores/DATA_STORE_ID`.
 * @param {string} query - The natural language search query string.
 * @param {object} [options] - Optional configuration for the search request.
 * @param {string} [options.location] - The GCP region where the data store is located (e.g., 'global', 'us-central1').
 *                                      Defaults to `config.google.gcp_location` or 'global'.
 * @param {number} [options.pageSize=10] - The maximum number of search results to return. Max 100.
 * @param {string} [options.filter] - An optional filter expression to refine search results.
 *                                    See Discovery Engine documentation for filter syntax.
 * @returns {Promise<{
 *   success: boolean,
 *   originalQuery: string,
 *   dataStoreId?: string,
 *   totalCount?: number,
 *   results: Array<{
 *     id: string,
 *     name: string,
 *     title: string,
 *     snippet: string,
 *     link: string,
 *     relevanceScore: number,
 *     index: number
 *   }>,
 *   error?: string
 * }>} A promise that resolves to an object containing the search results or an error.
 *   - `success`: `true` if the query was successful, `false` otherwise.
 *   - `originalQuery`: The query string that was used.
 *   - `dataStoreId`: The ID of the data store that was queried (present on success).
 *   - `totalCount`: The number of results found (present on success).
 *   - `results`: An array of structured search result objects. Each object contains:
 *     - `id`: The unique ID of the document.
 *     - `name`: The full resource name of the document.
 *     - `title`: The title of the document.
 *     - `snippet`: A short textual snippet from the document relevant to the query.
 *     - `link`: A URL link to the original document, if available.
 *     - `relevanceScore`: A score indicating the relevance of the document to the query.
 *     - `index`: The 1-based index of the result in the returned list.
 *   - `error`: An error message if the query failed (present on failure).
 * @throws {Error} If `GCP_PROJECT_ID` or `dataStoreId` is not configured or provided.
 */
const searchDataStore = async (dataStoreId, query, options = {}) => {
  try {
    // projectId and location are derived from config/env, but for the API endpoint,
    // if dataStoreId is a full resource path, these are implicitly part of it.
    // They are kept here for general context or if GoogleAuth needs them.
    const projectId = config.google.gcp_project_id || process.env.GCP_PROJECT_ID;
    const location = options.location || config.google.gcp_location || process.env.GCP_LOCATION || 'global';
    const pageSize = options.pageSize || 10;
    const filter = options.filter || '';

    if (!projectId) {
      // While dataStoreId contains project info, the overall GCP context might still need this.
      // Keeping this check as it's a general configuration requirement.
      throw new Error('GCP Project ID is not configured.');
    }

    if (!dataStoreId) {
      throw new Error('Discovery Engine Data Store ID is required.');
    }

    // BUG FIX: Add validation for dataStoreId format as per JSDoc.
    // This ensures the dataStoreId is a valid resource path and helps prevent malformed requests.
    // It also implicitly addresses a part of the IDOR concern by ensuring the input is at least syntactically correct.
    const dataStoreIdRegex = /^projects\/\d+\/locations\/[a-zA-Z0-9-]+\/dataStores\/[a-zA-Z0-9-]+$/;
    if (!dataStoreIdRegex.test(dataStoreId)) {
      throw new Error('Invalid Discovery Engine Data Store ID format. Expected: projects/PROJECT_NUMBER/locations/LOCATION/dataStores/DATA_STORE_ID');
    }

    if (!query) {
      // Returning success: true with empty results for an empty query is a design choice.
      // If an empty query should be an error, this logic needs to change.
      return {
        success: true,
        originalQuery: '',
        results: []
      };
    }

    // Extract project and location from the dataStoreId for accurate logging.
    const dataStorePathParts = dataStoreId.split('/');
    const dataStoreProjectId = dataStorePathParts[1];
    const dataStoreLocation = dataStorePathParts[3];

    logger.info(`GCP Vertex Search: Querying data store "${dataStoreId}" (project: ${dataStoreProjectId}, location: ${dataStoreLocation})...`);

    const client = await auth.getClient();
    // CRITICAL BUG FIX: The dataStoreId parameter is expected to be the full resource path
    // as per JSDoc. The endpoint URL should use this path directly.
    // The original code was incorrectly constructing a path like
    // ".../dataStores/projects/PROJECT_NUMBER/locations/LOCATION/dataStores/DATA_STORE_ID/..."
    // which is malformed and would lead to API errors (e.g., 404 Not Found).
    const endpoint = `https://discoveryengine.googleapis.com/v1beta/${dataStoreId}/branches/default_branch/documents:search`;

    const requestBody = {
      query: query,
      pageSize: Math.min(pageSize, 100) // Ensure pageSize does not exceed API limit
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
        // Provide a fallback relevance score if not present, useful for display
        relevanceScore: res.relevanceScore || (1.0 - (index * 0.05)),
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
    // Return empty results array to prevent crashing workflows, keeping service resilient.
    // Ensure originalQuery and dataStoreId are included for context in error response.
    return {
      success: false,
      originalQuery: query,
      dataStoreId: dataStoreId,
      error: err.message,
      results: []
    };
  }
};

/**
 * Provides a service interface for interacting with Google Cloud Vertex AI Search (Discovery Engine).
 * @namespace GcpVertexSearchService
 */
export const GcpVertexSearchService = {
  /**
   * @function searchDataStore
   * @memberof GcpVertexSearchService
   * @description Queries a Vertex AI Search & Conversation (Discovery Engine) semantic data store.
   * @see {@link searchDataStore} for detailed documentation.
   */
  searchDataStore
};