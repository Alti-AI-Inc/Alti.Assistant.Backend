import axios from 'axios';
import { logger } from '../../../shared/logger.js';

// Centralize configuration for maintainability and resilience.
const GOOGLE_SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';
const REQUEST_TIMEOUT_MS = 5000; // 5-second timeout to prevent hanging requests.

/**
 * @typedef {object} SuggestionResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} query - The original query string used for the suggestion.
 * @property {string[]} suggestions - An array of search suggestion strings.
 * @property {string} [error] - Error message if the operation failed.
 */

/**
 * Validates if a string is a plausible ISO 639-1 language code.
 * @param {string} code - The code to validate.
 * @returns {boolean} - True if the code is a two-letter string.
 */
const isValidLanguageCode = (code) => {
  // This is a basic structural validation. The Google API handles invalid codes gracefully,
  // so a strict check against a full list of ISO 639-1 codes is not critical here.
  return typeof code === 'string' && /^[a-zA-Z]{2}$/.test(code);
};

/**
 * Programmatically queries Google's autocomplete/suggestion engine.
 *
 * @param {string} query - Target search query prefix.
 * @param {string} [language='en'] - Preferred language code (hl) for the suggestions. Defaults to 'en'.
 * @returns {Promise<SuggestionResult>} A promise that resolves to an object containing the query,
 *   a list of search suggestions, and a success/error status.
 */
const getSearchSuggestions = async (query, language = 'en') => {
  // Sanitize and validate inputs for security and reliability.
  const sanitizedQuery = (query || '').trim();
  const sanitizedLanguage = isValidLanguageCode(language) ? language.toLowerCase() : 'en';

  if (!sanitizedQuery) {
    return {
      success: true,
      query: '',
      suggestions: []
    };
  }

  try {
    logger.info(`GCP Suggest: Querying search autocomplete predictions for "${sanitizedQuery}" (hl: ${sanitizedLanguage})...`);

    const params = {
      client: 'chrome', // Using 'chrome' client type provides high-quality, general-purpose suggestions.
      q: sanitizedQuery,
      hl: sanitizedLanguage
    };

    const response = await axios.get(GOOGLE_SUGGEST_URL, {
      params,
      timeout: REQUEST_TIMEOUT_MS
    });

    // Standard Google Autocomplete JSON output format:
    // [ "query", ["suggestion 1", "suggestion 2", ...], ["", "", ...], ... ]
    // Defensively parse the response to prevent errors if the format is unexpected.
    const data = response.data;
    const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];

    logger.info(`GCP Suggest: Resolved ${suggestions.length} search autocomplete predictions for "${sanitizedQuery}".`);

    return {
      success: true,
      query: sanitizedQuery,
      suggestions: suggestions
    };
  } catch (err) {
    // Implement robust error handling to provide clearer diagnostics and prevent crashes.
    let errorMessage = 'An unexpected error occurred while fetching search suggestions.';
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') {
        errorMessage = `Request to Google Suggest API timed out after ${REQUEST_TIMEOUT_MS}ms.`;
        logger.error(`GCP Suggest Lookup Error: ${errorMessage}`);
      } else if (err.response) {
        // The request was made and the server responded with a non-2xx status code.
        errorMessage = `Google Suggest API responded with status ${err.response.status}.`;
        logger.error(`GCP Suggest Lookup Error: ${errorMessage}`, { status: err.response.status, data: err.response.data });
      } else if (err.request) {
        // The request was made but no response was received.
        errorMessage = 'No response received from Google Suggest API. Check network connectivity.';
        logger.error(`GCP Suggest Lookup Error: ${errorMessage}`, { code: err.code });
      } else {
        // An error occurred setting up the request.
        errorMessage = err.message;
        logger.error('GCP Suggest Lookup Error: Error setting up request.', err);
      }
    } else {
      // A non-Axios error occurred.
      logger.error('GCP Suggest Lookup Error: A non-network error occurred.', err);
      if (err instanceof Error) {
        errorMessage = err.message;
      }
    }

    return {
      success: false,
      query: sanitizedQuery,
      error: errorMessage,
      suggestions: []
    };
  }
};

/**
 * Service for interacting with Google's autocomplete/suggestion engine.
 * Provides methods to retrieve search suggestions based on a query.
 * @namespace GcpSuggestService
 */
export const GcpSuggestService = {
  getSearchSuggestions
};