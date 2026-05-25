import axios from 'axios';
import { logger } from '../../../shared/logger.js';

/**
 * Programmatically queries Google's autocomplete/suggestion engine.
 * 
 * @param {string} query - Target search query prefix
 * @param {string} [language='en'] - Preferred language code (hl)
 * @returns {Promise<object>} List of search suggestions
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

    const url = `http://suggestqueries.google.com/complete/search`;
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

export const GcpSuggestService = {
  getSearchSuggestions
};
