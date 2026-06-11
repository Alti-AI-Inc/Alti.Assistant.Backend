/**
 * @file This module provides utility functions for interacting with external services,
 * specifically for performing Google searches using a specialized grounding tool.
 * It abstracts the complexity of the search tool to provide a simple interface for fetching search results.
 */

import httpStatus from 'http-status';
import { GoogleSearchGroundingTool } from '../deep_research/utils/google-search-grounding.js';
import logger from '../../../config/logger.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Fetches search results from Google using the Google Search Grounding Tool.
 * This function instantiates the search tool, invokes it with the given query,
 * and formats the results into a standardized array of objects.
 *
 * @async
 * @param {string} query - The search query string to be used for finding relevant information.
 * @returns {Promise<Array<{title: string, link: string, snippet: string}>>} A promise that resolves to an array of search result objects.
 *   Each object contains:
 *   - `title`: The title of the search result.
 *   - `link`: The URL link to the search result.
 *   - `snippet`: A brief content snippet from the search result.
 *   Returns an empty array if no results are found.
 * @throws {ApiError} Throws an ApiError if the Google Search Grounding Tool
 *   encounters an issue during its construction or invocation.
 */
export const fetchSearchResults = async (query) => {
  try {
    // Instantiate the tool inside the try block to catch potential errors during its construction
    const searchTool = new GoogleSearchGroundingTool({ maxResults: 3 });
    const response = await searchTool.invoke({ query, includeAnswer: false });
    return (response.results || []).map(r => ({
      title: r.title,
      link: r.url,
      snippet: r.content
    }));
  } catch (error) {
    // Log the detailed internal error for debugging.
    logger.error('Google Search Grounding Error in Groq utility.', {
      errorMessage: error.message,
      errorStack: error.stack,
      context: {
        query,
      },
    });

    // Throw a normalized, user-friendly error to be handled by the global error handler.
    // This prevents leaking internal implementation details like stack traces to the client
    // and allows the caller to distinguish between a search with no results and a system failure.
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch search results due to an internal error.');
  }
};