const axios = require('axios');

// Security: Load API key from environment variables.
// This prevents hardcoding sensitive credentials and allows for easy management across environments.
// Ensure SERPER_API_KEY is set in your environment (e.g., via .env file and dotenv package, or directly in deployment).
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_API_URL = 'https://google.serper.dev/search';

// UX Optimization: Define a request timeout to prevent hanging requests, improving user experience by failing fast.
const REQUEST_TIMEOUT_MS = 8000; // 8 seconds

// Security & Robustness: Whitelist allowed parameters to prevent unexpected behavior or data leakage from the options object.
const ALLOWED_OPTIONS = new Set(['gl', 'hl', 'num', 'tbs', 'searchType', 'page', 'autocorrect']);

/**
 * Performs a search using the Serper API, ensuring robust execution and a good user experience.
 * @param {string} query The search query.
 * @param {object} [options={}] Additional search options.
 * @param {string} [options.gl] Geolocation for search results (e.g., 'us').
 * @param {string} [options.hl] Host language for search results (e.g., 'en').
 * @param {number} [options.num] Number of results to return (e.g., 10).
 * @param {string} [options.tbs] Time-based search filter.
 * @param {string} [options.searchType] Type of search (e.g., 'images', 'news', 'shopping').
 * @param {number} [options.page] Page number for pagination.
 * @param {boolean} [options.autocorrect] Enable or disable autocorrect.
 * @returns {Promise<object>} The search results from the Serper API.
 */
async function search(query, options = {}) {
    // Robustness: Validate that the query is a non-empty string.
    if (typeof query !== 'string' || query.trim().length === 0) {
        // This prevents errors from sending invalid data to the external API.
        throw new Error('Search query must be a non-empty string.');
    }

    // Robustness: Verify service configuration before making a request.
    if (!SERPER_API_KEY) {
        // Log a specific error for developers if the API key is missing.
        console.error('SERPER_API_KEY is not configured in environment variables.');
        // Throw a generic error to the client to avoid exposing internal configuration details.
        throw new Error('Search service is not properly configured.');
    }

    // Security: Sanitize options by only including whitelisted keys with non-null values.
    // This prevents injection of unintended parameters into the external API call.
    const sanitizedOptions = Object.keys(options)
        .filter(key => ALLOWED_OPTIONS.has(key) && options[key] !== undefined && options[key] !== null)
        .reduce((obj, key) => {
            obj[key] = options[key];
            return obj;
        }, {});

    try {
        const response = await axios.post(SERPER_API_URL, {
            q: query.trim(), // UX Improvement: Trim query to handle leading/trailing whitespace.
            ...sanitizedOptions
        }, {
            headers: {
                'X-API-KEY': SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            // UX Optimization: Set a timeout to prevent requests from hanging indefinitely.
            // If the Serper API is slow, the user's request will fail fast instead of waiting.
            timeout: REQUEST_TIMEOUT_MS
        });

        return response.data;
    } catch (error) {
        // UX Improvement: Differentiate between a timeout error and other API errors.
        if (error.code === 'ECONNABORTED') {
            console.error(`Serper API request timed out after ${REQUEST_TIMEOUT_MS}ms for query: "${query}"`);
            throw new Error('The search request took too long to complete. Please try again.');
        }

        // Debuggability: Log detailed error information for backend diagnostics.
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`Error calling Serper API for query: "${query}". Error: ${errorMessage}`);

        // Security & UX: Re-throw a generic, user-friendly error message.
        // This prevents exposing internal API error details to the client.
        throw new Error('Failed to perform search due to an issue with an external service.');
    }
}

module.exports = {
    search
};