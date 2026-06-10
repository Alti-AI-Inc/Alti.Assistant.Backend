import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
// INTEGRATION: Import services for workspace-level checks and usage tracking.
// These are hypothetical services representing a real-world application architecture.
import { UsageService } from '../../../shared/services/usage.service.js';
import { WorkspaceService } from '../../workspace/workspace.service.js';
// INTEGRATION: Import custom error classes for consistent error handling.
import { AppError, ForbiddenError, UsageLimitError } from '../../../shared/errors.js';

/**
 * @typedef {object} FontCache
 * @property {Array<object>|null} data - The cached list of fonts.
 * @property {number} lastFetched - The timestamp of the last fetch.
 * @property {number} ttl - The time-to-live for the cache in milliseconds.
 */

/**
 * In-memory cache for the Google Fonts list to improve performance and reduce external API calls.
 * The Google Fonts API returns the entire list of fonts on every request, so caching is highly effective.
 * @type {FontCache}
 */
const fontCache = {
  data: null,
  lastFetched: 0,
  ttl: 24 * 60 * 60 * 1000, // Cache for 24 hours
};

/**
 * Searches and retrieves premium web font definitions and asset URLs from the Google Fonts API.
 * This is a secure, context-aware service method that respects tenant boundaries and usage limits.
 *
 * @param {object} authContext - The authentication context of the user making the request.
 * @param {string} authContext.workspaceId - The ID of the workspace to scope the action.
 * @param {object} authContext.user - The user object, containing ID and role.
 * @param {object} options - The options for resolving fonts.
 * @param {string} [options.filterQuery] - Optional search filter for font family names (e.g., "Roboto", "Serif")
 * @param {string} [options.sortBy] - Sorting criteria: 'alpha' (alphabetical), 'date' (last modified), 'popularity', 'style', 'trending' (default 'popularity')
 * @param {number} [options.limit] - Max number of font records to return (default 10, max 100)
 * @returns {Promise<object>} Google Fonts list report
 */
const resolveGoogleFonts = async (authContext, { filterQuery = '', sortBy = 'popularity', limit = 10 }) => {
  // INTEGRATION: Enforce that a valid authentication context is provided. This prevents
  // unauthenticated or cross-tenant access, ensuring all actions are auditable and
  // correctly scoped to a specific tenant (workspace).
  if (!authContext || !authContext.workspaceId || !authContext.user || !authContext.user.id) {
    // This indicates a severe programming error where a secured service was called without context.
    throw new AppError('Authentication context is required.', 500, 'AUTH_CONTEXT_MISSING');
  }
  const { user, workspaceId } = authContext;

  // INTEGRATION: Role-Based Access Control (RBAC).
  // For this specific read-only action (searching fonts), any authenticated user within the
  // workspace is permitted. More restrictive checks would be applied for actions like *setting* a font.
  // The validation of the authContext itself serves as the primary authorization check here.

  // INTEGRATION: Workspace/tenant feature limits and usage checks.
  // Verify if the workspace's subscription plan includes this feature and if they are within usage quotas.
  const canUseFeature = await WorkspaceService.isFeatureEnabled(workspaceId, 'customFonts');
  if (!canUseFeature) {
    throw new ForbiddenError('The custom fonts feature is not enabled for your workspace.');
  }

  const hasExceededLimit = await UsageService.hasExceededLimit(workspaceId, 'gcp_font_searches');
  if (hasExceededLimit) {
    throw new UsageLimitError('You have exceeded the number of font searches allowed for your plan.');
  }

  try {
    const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;
    if (!apiKey) {
      // This is a server configuration error, not a user error.
      logger.error('CRITICAL: Google Search/Fonts API Key is not configured.');
      throw new AppError('Font service is currently unavailable due to a configuration issue.', 503, 'SERVICE_UNAVAILABLE');
    }

    // BUGFIX: Sanitize and validate all user-provided input parameters.
    const sanitizedFilterQuery = (filterQuery || '').trim();
    const sanitizedLimit = parseInt(limit, 10);
    // Enforce a sensible default and a maximum limit to prevent resource abuse.
    const effectiveLimit = !isNaN(sanitizedLimit) && sanitizedLimit > 0 ? Math.min(sanitizedLimit, 100) : 10;

    // Validate sortBy parameter against the allowed list from the Google Fonts API.
    const validSortByOptions = ['alpha', 'date', 'popularity', 'style', 'trending'];
    let effectiveSortBy = sortBy;
    if (!validSortByOptions.includes(sortBy)) {
      logger.warn(`GCP Fonts API: Invalid sortBy parameter "${sortBy}" provided for workspace ${workspaceId}. Defaulting to "popularity".`);
      effectiveSortBy = 'popularity';
    }

    logger.info(`GCP Fonts API: User ${user.id} in workspace ${workspaceId} is resolving web fonts (filter: "${sanitizedFilterQuery}", sort: "${effectiveSortBy}", limit: ${effectiveLimit})...`);

    const endpoint = 'https://www.googleapis.com/webfonts/v1/webfonts';
    const params = {
      key: apiKey,
      sort: effectiveSortBy
    };

    let allFonts = [];
    const now = Date.now();

    // PERFORMANCE: Use cache if valid to avoid redundant external API calls.
    if (fontCache.data && (now - fontCache.lastFetched < fontCache.ttl)) {
      logger.info(`GCP Fonts API: Serving ${fontCache.data.length} fonts from cache for workspace ${workspaceId}.`);
      allFonts = fontCache.data;
    } else {
      logger.info(`GCP Fonts API: Cache stale or empty. Fetching fresh font list from Google API.`);
      const response = await axios.get(endpoint, { params });
      allFonts = response.data.items || [];
      
      // Update cache upon successful fetch.
      fontCache.data = allFonts;
      fontCache.lastFetched = now;
      logger.info(`GCP Fonts API: Cached ${allFonts.length} fonts.`);
    }

    // Apply server-side filtering as the Google Fonts API does not support it directly.
    let filteredItems = allFonts;
    if (sanitizedFilterQuery) {
      const queryLower = sanitizedFilterQuery.toLowerCase();
      filteredItems = allFonts.filter(item => item.family.toLowerCase().includes(queryLower));
    }

    // Apply limit after filtering.
    const totalMatching = filteredItems.length;
    const slicedItems = filteredItems.slice(0, effectiveLimit).map(item => ({
      family: item.family,
      variants: item.variants || [],
      subsets: item.subsets || [],
      version: item.version || '',
      category: item.category || 'sans-serif',
      files: item.files || {}
    }));

    logger.info(`GCP Fonts API: Resolved ${slicedItems.length} fonts out of ${totalMatching} total matches for workspace ${workspaceId}.`);

    // INTEGRATION: Propagate usage details up to managers/administrators.
    // After a successful operation, record the usage against the workspace. This allows the system
    // to track quotas, generate billing events, and provide analytics to workspace owners.
    await UsageService.record(workspaceId, 'gcp_font_search', { count: 1, userId: user.id });

    return {
      success: true,
      filterQuery: sanitizedFilterQuery,
      sortBy: effectiveSortBy,
      totalCount: totalMatching,
      returnedCount: slicedItems.length,
      fonts: slicedItems
    };
  } catch (err) {
    // SECURITY: Centralized error handling. If it's a known application error, re-throw it.
    // Otherwise, log the unknown error and throw a generic one to avoid leaking details.
    if (err instanceof AppError || err instanceof ForbiddenError || err instanceof UsageLimitError) {
      throw err;
    }

    logger.error(`GCP Fonts API Resolution Error for workspace ${workspaceId} and user ${user.id}:`, err);
    throw new AppError('An unexpected error occurred while resolving Google Fonts.', 500, 'GCP_FONTS_API_FAILURE');
  }
};

export const GcpFontsService = {
  resolveGoogleFonts
};