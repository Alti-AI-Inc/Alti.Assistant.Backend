/**
 * @module TavilyService
 * @description Provides functions for interacting with the Tavily Search API to perform web searches.
 * This service abstracts the direct API calls, making it easier to integrate Tavily search capabilities
 * into the application.
 */

const axios = require('axios');
const { TAVILY_API_KEY } = require('../../config/config');

/**
 * Searches the web using the Tavily API based on a given query.
 * It performs an 'advanced' search, includes an answer if available, and limits results.
 *
 * @async
 * @function search
 * @param {string} query - The search query string to be sent to the Tavily API.
 * @returns {Promise<object>} A promise that resolves with the Tavily search results.
 *   The returned object typically contains properties such as:
 *   - `answer` (string): A concise answer to the query if found.
 *   - `results` (Array<object>): An array of search result objects, each containing `title`, `url`, `content`, etc.
 *   - Other Tavily-specific metadata.
 * @throws {Error} If the Tavily API call fails (e.g., network error, API key issue, or internal Tavily error),
 *   an error is logged and a new error is thrown indicating failure to perform the search.
 */
async function search(query) {
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
        return response.data;
    } catch (error) {
        console.error('Error searching with Tavily:', error.message);
        throw new Error('Failed to perform Tavily search.');
    }
}

/**
 * @exports TavilyService
 * @property {function(string): Promise<object>} search - Function to perform a web search using Tavily.
 */
module.exports = {
    search,
};