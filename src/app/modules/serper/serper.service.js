const axios = require('axios');

// Security Fix: Load API key from environment variables.
// This prevents hardcoding sensitive credentials and allows for easy management across environments.
// Ensure SERPER_API_KEY is set in your environment (e.g., via .env file and dotenv package, or directly in deployment).
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const SERPER_API_URL = 'https://google.serper.dev/search';

/**
 * Performs a search using the Serper API.
 * @param {string} query The search query.
 * @param {object} options Additional search options (e.g., gl, hl, num).
 * @returns {Promise<object>} The search results.
 */
async function search(query, options = {}) {
    // Bug Fix: Enhanced input validation for the query.
    // Ensures query is a non-empty string after trimming whitespace.
    if (typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Search query must be a non-empty string.');
    }

    // Security Fix: Check if the API key is configured.
    // Prevents requests with missing credentials.
    if (!SERPER_API_KEY) {
        // Log an error if the API key is missing, but don't expose it to the client.
        console.error('SERPER_API_KEY is not configured in environment variables.');
        throw new Error('Service is not configured: Serper API key is missing.');
    }

    try {
        const response = await axios.post(SERPER_API_URL, {
            q: query,
            ...options
        }, {
            headers: {
                'X-API-KEY': SERPER_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        // Bug Fix: Log the full error object for better debugging.
        // This includes stack trace and other relevant error properties.
        console.error('Error calling Serper API:', error);

        // Bug Fix: Re-throw a generic error message to the caller.
        // This prevents exposing internal API error details to the client,
        // while still indicating that an error occurred.
        throw new Error('Failed to perform search due to an external service error.');
    }
}

module.exports = {
    search
};