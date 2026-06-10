import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Searches and retrieves premium web font definitions and asset URLs from the Google Fonts API.
 * This is a secure, context-aware service method.
 *
 * @param {object} authContext - The authentication context of the user making the request.
 * @param {string} authContext.workspaceId - The ID of the workspace to scope the action.
 * @param {object} authContext.user - The user object, containing ID and role.
 * @param {object} options - The options for resolving fonts.
 * @param {string} [options.filterQuery] - Optional search filter for font family names (e.g., "Roboto", "Serif")
 * @param {string} [options.sortBy] - Sorting criteria: 'alpha' (alphabetical), 'date' (last modified), 'popularity', 'style', 'trending' (default 'popularity')
 * @param {number} [options.limit] - Max number of font records to return (default 10)
 * @returns {Promise<object>} Google Fonts list report
 */
const resolveGoogleFonts = async (authContext, { filterQuery = '', sortBy = 'popularity', limit = 10 }) => {
  // INTEGRATION: Enforce that a valid authentication context is provided. This prevents
  // unauthenticated or cross-tenant access to this service, ensuring all actions are
  // auditable and correctly scoped to a specific tenant (workspace).
  if (!authContext || !authContext.workspaceId || !authContext.user || !authContext.user.id) {
    // This error indicates a severe integration issue (a programming error).
    // It should be caught by a global error handler and logged for security review.
    throw new Error('Authentication context is required to resolve Google Fonts.');
  }

  // INTEGRATION: Placeholder for Role-Based Access Control (RBAC).
  // Here, you would check if the user's role (e.g., user, manager, admin) has the necessary
  // permissions to perform this action within their workspace. For now, we assume any
  // authenticated user can search for fonts.
  // Example: if (!hasPermission(authContext.user.role, 'search_fonts')) {
  //   throw new Error('Forbidden: You do not have permission to search for fonts.');
  // }

  // INTEGRATION: Placeholder for workspace/tenant feature limits and usage checks.
  // This is where you would verify if the workspace's subscription plan includes this feature
  // or if they have exceeded a usage quota before making the external API call.
  // Example: const canPerformAction = await UsageService.canUseFeature(authContext.workspaceId, 'customFonts');
  // if (!canPerformAction) {
  //   throw new Error('Usage limit exceeded or feature not enabled for your workspace.');
  // }

  try {
    const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('Google Search/Fonts API Key is not configured.');
    }

    // BUGFIX: Sanitize and validate the 'limit' parameter to ensure it's a positive integer.
    // This prevents potential issues with non-numeric or negative inputs.
    const sanitizedLimit = parseInt(limit, 10);
    const effectiveLimit = !isNaN(sanitizedLimit) && sanitizedLimit > 0 ? sanitizedLimit : 10;

    // Validate sortBy parameter to ensure it's one of the accepted values by the Google Fonts API.
    // If an invalid value is provided, default to 'popularity' to prevent API errors or unexpected behavior.
    const validSortByOptions = ['alpha', 'date', 'popularity', 'style', 'trending'];
    if (!validSortByOptions.includes(sortBy)) {
      logger.warn(`GCP Fonts API: Invalid sortBy parameter "${sortBy}" provided for workspace ${authContext.workspaceId}. Defaulting to "popularity".`);
      sortBy = 'popularity';
    }

    logger.info(`GCP Fonts API: User ${authContext.user.id} in workspace ${authContext.workspaceId} is resolving web fonts (filter: "${filterQuery}", sort: "${sortBy}", limit: ${effectiveLimit})...`);

    const endpoint = 'https://www.googleapis.com/webfonts/v1/webfonts';
    const params = {
      key: apiKey,
      sort: sortBy
    };

    // NOTE ON PERFORMANCE: The Google Fonts API (webfonts/v1/webfonts) does not support
    // server-side filtering by family name or limiting the number of results directly.
    // Therefore, all available fonts are fetched first, and then client-side filtering
    // and limiting are applied. For very large font lists or frequent calls with small limits,
    // this might lead to higher network usage and processing overhead than ideal.
    const response = await axios.get(endpoint, { params });
    let items = response.data.items || [];

    // Filter by family name if query is provided
    if (filterQuery) {
      const queryLower = filterQuery.toLowerCase();
      items = items.filter(item => item.family.toLowerCase().includes(queryLower));
    }

    // Limit the results
    const totalMatching = items.length;
    const slicedItems = items.slice(0, effectiveLimit).map(item => ({
      family: item.family,
      variants: item.variants || [],
      subsets: item.subsets || [],
      version: item.version || '',
      category: item.category || 'sans-serif',
      files: item.files || {}
    }));

    logger.info(`GCP Fonts API: Resolved ${slicedItems.length} fonts out of ${totalMatching} total matches for workspace ${authContext.workspaceId}.`);

    // INTEGRATION: Propagate usage details up to managers/administrators.
    // After a successful operation, record the usage against the workspace. This allows the system
    // to track quotas, generate billing events, and provide analytics to workspace owners.
    // Example: await UsageService.record(authContext.workspaceId, 'gcp_font_api_call', { count: 1, userId: authContext.user.id });

    return {
      success: true,
      filterQuery,
      sortBy,
      totalCount: totalMatching,
      returnedCount: slicedItems.length,
      fonts: slicedItems
    };
  } catch (err) {
    // Log the error with context for better debugging and security monitoring.
    logger.error(`GCP Fonts API Resolution Error for workspace ${authContext.workspaceId}:`, err);
    // Re-throw a new error with a more specific message for the caller.
    throw new Error(`Google Fonts resolution failed: ${err.message}`);
  }
};

export const GcpFontsService = {
  resolveGoogleFonts
};