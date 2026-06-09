/**
 * @file This module provides utility functions for interacting with external services,
 * specifically for performing Google searches using a specialized grounding tool.
 * It abstracts the complexity of the search tool to provide a simple interface for fetching search results.
 */

import { GoogleSearchGroundingTool } from '../deep_research/utils/google-search-grounding.js';

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
 *   Returns an empty array if an error occurs during the search process or if no results are found.
 * @throws {Error} Logs an error message to the console if the Google Search Grounding Tool
 *   encounters an issue during its construction or invocation, but does not re-throw.
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
    console.error('Google Search Grounding Error in Groq utility:', error.message);
    return [];
  }
};