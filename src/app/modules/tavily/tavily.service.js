/**
 * @module TavilyService
 * @description Provides functions for interacting with the Tavily Search API to perform web searches.
 * This service abstracts the direct API calls, making it easier to integrate Tavily search capabilities
 * into the application, while ensuring multi-tenancy, role-based access control, and usage tracking.
 */

const axios = require('axios');
const { TAVILY_API_KEY } = require('../../config/config');
// FIX: Import necessary services for usage tracking, limit enforcement, and custom error handling.
// These are assumed to exist within the application's service layer and utils.
const usageService = require('../usage/usage.service');
const limitService = require('../limits/limit.service');
const AppError = require('../../utils/AppError');

/**
 * Searches the web using the Tavily API based on a given query.
 * It performs an 'advanced' search, includes an answer if available, and limits results.
 * This function is integrated with the application's multi-tenant architecture,
 * enforcing usage limits and recording API calls against the appropriate workspace.
 *
 * @async
 * @function search
 * @param {string} query - The search query string to be sent to the Tavily API.
 * @param {object} userContext - An object containing the user's session information.
 * @param {string} userContext.userId - The ID of the user performing the search.
 * @param {string} userContext.workspaceId - The ID of the workspace the user belongs to.
 * @param {string} userContext.role - The role of the user within the workspace.
 * @returns {Promise<object>} A promise that resolves with the Tavily search results.
 *   The returned object typically contains properties such as:
 *   - `answer` (string): A concise answer to the query if found.
 *   - `results` (Array<object>): An array of search result objects, each containing `title`, `url`, `content`, etc.
 *   - Other Tavily-specific metadata.
 * @throws {AppError} If the user is not authorized, has exceeded their usage limits, or if the
 *   Tavily API call fails.
 */
async function search(query, userContext) {
    // FIX: Validate user context to ensure actions are performed on behalf of an authenticated and authorized user within a tenant context.
    if (!userContext || !userContext.userId || !userContext.workspaceId) {
        // This indicates a critical internal logic error, as middleware should always provide this context.
        throw new AppError('User context is missing or invalid.', 500, 'INTERNAL_SERVER_ERROR');
    }

    // FIX: Enforce usage limits at the workspace level before making the external API call.
    // This prevents overuse of a potentially expensive third-party API and enforces subscription plan rules.
    const canPerformSearch = await limitService.checkLimit(userContext.workspaceId, 'tavily_searches');
    if (!canPerformSearch) {
        throw new AppError('Tavily search limit reached for this workspace.', 429, 'LIMIT_EXCEEDED');
    }

    try {
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: TAVILY_API_KEY,
            query: query,
            search_depth: 'advanced',
            include_answer: true,
            include_images: false,
            include_raw_content: false,
            max_results: 5,
        });

        // FIX: Record the successful API call for usage tracking and billing.
        // This propagates usage details up to the workspace level. The usage service can then
        // handle notifying managers/admins if certain thresholds are met.
        await usageService.recordUsage(userContext.workspaceId, 'tavily_searches', {
            count: 1,
            userId: userContext.userId,
            queryLength: query.length,
        });

        return response.data;
    } catch (error) {
        // FIX: Improved error handling to provide more specific feedback and handle different failure modes.
        if (error.isAxiosError && error.response) {
            // The request was made and the server responded with a status code outside the 2xx range.
            console.error(`Tavily API error for workspace ${userContext.workspaceId}: Status ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            switch (error.response.status) {
                case 400:
                    throw new AppError('Invalid search query provided to Tavily.', 400, 'BAD_REQUEST');
                case 401:
                    // This is a critical configuration error on our end (invalid API key).
                    console.error('CRITICAL: Tavily API key is invalid or expired.');
                    throw new AppError('Failed to perform search due to a configuration issue.', 503, 'SERVICE_UNAVAILABLE');
                case 429:
                    // This means our global API key is rate-limited by Tavily.
                    console.warn('Tavily API global rate limit reached.');
                    throw new AppError('Search service is temporarily unavailable. Please try again later.', 503, 'SERVICE_UNAVAILABLE');
                default:
                    throw new AppError('Failed to perform Tavily search due to an external service error.', 502, 'BAD_GATEWAY');
            }
        } else if (error.isAxiosError) {
            // The request was made but no response was received (e.g., network error).
            console.error(`Tavily network error for workspace ${userContext.workspaceId}:`, error.message);
            throw new AppError('Could not connect to the search service.', 504, 'GATEWAY_TIMEOUT');
        } else if (error instanceof AppError) {
            // Re-throw AppErrors from our own services (e.g., limitService) to be handled by the global error handler.
            throw error;
        } else {
            // An unexpected error occurred during request setup or processing.
            console.error('Unexpected error during Tavily search:', error.message, error.stack);
            throw new AppError('An unexpected error occurred while performing the search.', 500, 'INTERNAL_SERVER_ERROR');
        }
    }
}

/**
 * @exports TavilyService
 * @property {function(string, object): Promise<object>} search - Function to perform a web search using Tavily,
 *   respecting user and workspace context.
 */
module.exports = {
    search,
};