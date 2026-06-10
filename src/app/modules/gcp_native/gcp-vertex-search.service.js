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
 * Discovery Engine API response into a more consumable format. It includes security checks
 * to ensure that requests are authorized for the correct GCP project, which is critical in a
 * multi-tenant environment like an Admin Platform.
 *
 * @param {string} dataStoreId - The unique identifier of the Discovery Engine Data Store to query.
 *                                This must be the full resource path, e.g., `projects/PROJECT_ID/locations/LOCATION/dataStores/DATA_STORE_ID`.
 * @param {string} query - The natural language search query string.
 * @param {object} [options] - Optional configuration for the search request.
 * @param {string} options.workspaceProjectId - The GCP Project ID associated with the current workspace/tenant.
 *                                              This is a mandatory security parameter to prevent cross-tenant data access (IDOR).
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
 *   - `totalCount`: The total number of results found for the query (present on success).
 *   - `results`: An array of structured search result objects.
 *   - `error`: An error message if the query failed (present on failure).
 * @throws {Error} If required parameters like `dataStoreId` or `workspaceProjectId` are missing or invalid.
 */
const searchDataStore = async (dataStoreId, query, options = {}) => {
  // REFACTOR: Use destructuring for cleaner access to options and provide defaults.
  const {
    workspaceProjectId,
    pageSize = 10,
    filter = ''
  } = options;

  try {
    if (!dataStoreId) {
      throw new Error('Discovery Engine Data Store ID is required.');
    }

    // SECURITY_ENHANCEMENT: Validate the format of the dataStoreId to prevent malformed requests
    // and ensure it's a valid resource path. This is a first line of defense.
    // GCP Project IDs can be names, not just numbers.
    const dataStoreIdRegex = /^projects\/[a-zA-Z0-9-]+\/locations\/[a-zA-Z0-9-]+\/(collections\/[a-zA-Z0-9-]+)?\/dataStores\/[a-zA-Z0-9-]+$/;
    if (!dataStoreIdRegex.test(dataStoreId)) {
      throw new Error('Invalid Discovery Engine Data Store ID format. Expected: projects/PROJECT_ID/locations/LOCATION/dataStores/DATA_STORE_ID');
    }

    // SECURITY_ENHANCEMENT: In a multi-tenant system (e.g., Admin Platform with multiple workspaces),
    // it's critical to verify that the requested resource (dataStoreId) belongs to the
    // authenticated workspace's designated GCP project. This prevents IDOR vulnerabilities.
    if (!workspaceProjectId) {
      throw new Error('Workspace Project ID is required for authorization.');
    }

    const dataStorePathParts = dataStoreId.split('/');
    const dataStoreProjectId = dataStorePathParts[1];

    if (dataStoreProjectId !== workspaceProjectId) {
      logger.warn(`Authorization mismatch: Attempted to access data store in project "${dataStoreProjectId}" from a context expecting project "${workspaceProjectId}".`);
      // Return a generic error to avoid leaking information about resource existence.
      throw new Error('Access to the specified data store is not authorized.');
    }

    if (!query) {
      // An empty query is not an error; it simply yields no results.
      return {
        success: true,
        originalQuery: '',
        results: [],
        totalCount: 0,
        dataStoreId: dataStoreId
      };
    }

    const dataStoreLocation = dataStorePathParts[3];
    logger.info(`GCP Vertex Search: Querying data store "${dataStoreId}" (project: ${dataStoreProjectId}, location: ${dataStoreLocation})...`);

    const client = await auth.getClient();

    // The endpoint uses the full dataStoreId resource path.
    // The API version and branch are hardcoded but could be moved to config if they need to be dynamic.
    const apiVersion = 'v1beta';
    const branch = 'default_branch';
    const endpoint = `https://discoveryengine.googleapis.com/${apiVersion}/${dataStoreId}/servingConfigs/default_search:search`;

    const requestBody = {
      query: query,
      pageSize: Math.min(pageSize, 100), // Ensure pageSize does not exceed the API limit of 100.
      // OPTIMIZATION: Request only necessary fields to reduce payload size.
      contentSearchSpec: {
        snippetSpec: {
          returnSnippet: true
        },
        summarySpec: {
          summaryResultCount: 3 // Request a summary for top results, can be configured.
        }
      }
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
      // Handle both `derivedStructData` (for website data) and `structData` (for structured data).
      const fields = doc.derivedStructData || doc.structData || {};
      
      return {
        id: doc.id,
        name: doc.name,
        title: fields.title || doc.id || 'Untitled Document',
        // ROBUSTNESS: Prefer generated snippets from contentSearchSpec if available.
        snippet: fields.snippets?.[0]?.snippet || fields.description || '',
        link: fields.link || fields.uri || '',
        relevanceScore: res.relevanceScore, // Use the actual score from the API.
        index: index + 1
      };
    });

    logger.info(`GCP Vertex Search: Successfully retrieved ${results.length} documents for query.`);

    return {
      success: true,
      originalQuery: query,
      dataStoreId: dataStoreId,
      totalCount: searchResponse.totalSize || results.length, // Use totalSize from response for accurate pagination.
      results: results
    };
  } catch (err) {
    // IMPROVEMENT: Enhance error logging with more details from the GCP API error response.
    const errorMessage = err.response?.data?.error?.message || err.message;
    const errorCode = err.response?.data?.error?.code || err.code;
    logger.error(`GCP Vertex Search Query Error (Code: ${errorCode || 'N/A'}): ${errorMessage}`, {
      // Log structured context for better debugging in platforms like Datadog/Sentry.
      error: {
        message: err.message,
        stack: err.stack,
        response: err.response?.data
      },
      dataStoreId,
      query
    });

    // Return a structured error response that is safe for the client and prevents service crashes.
    return {
      success: false,
      originalQuery: query,
      dataStoreId: dataStoreId,
      error: `Failed to query data store. Please check configuration and permissions.`,
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