import axios from 'axios';
import { logger } from '../../../shared/logger.js';

/**
 * @typedef {object} SuggestionResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} query - The original query string used for the suggestion.
 * @property {string[]} suggestions - An array of search suggestion strings.
 * @property {string} [error] - Error message if the operation failed.
 */

/**
 * Programmatically queries Google's autocomplete/suggestion engine.
 *
 * @param {string} query - Target search query prefix.
 * @param {string} [language='en'] - Preferred language code (hl) for the suggestions. Defaults to 'en'.
 * @returns {Promise<SuggestionResult>} A promise that resolves to an object containing the query,
 *   a list of search suggestions, and a success/error status.
 */
const getSearchSuggestions = async (query, language = 'en') => {
  try {
    if (!query) {
      return {
        success: true,
        query: '',
        suggestions: []
      };
    }

    logger.info(`GCP Suggest: Querying search autocomplete predictions for "${query}" (hl: ${language})...`);

    // Use HTTPS for secure communication with Google's suggestion service.
    const url = `https://suggestqueries.google.com/complete/search`;
    const params = {
      client: 'chrome',
      q: query,
      hl: language
    };

    const response = await axios.get(url, { params });

    // Standard Google Autocomplete JSON output format:
    // [ "query", ["suggestion 1", "suggestion 2", ...], ["", "", ...], ... ]
    const data = response.data;
    const suggestions = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];

    logger.info(`GCP Suggest: Resolved ${suggestions.length} search autocomplete predictions.`);

    return {
      success: true,
      query: query,
      suggestions: suggestions
    };
  } catch (err) {
    logger.error('GCP Suggest Lookup Error:', err);
    return {
      success: false,
      query: query,
      error: err.message,
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