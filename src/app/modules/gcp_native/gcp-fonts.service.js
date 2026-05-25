import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Searches and retrieves premium web font definitions and asset URLs from the Google Fonts API.
 * 
 * @param {string} [filterQuery] - Optional search filter for font family names (e.g., "Roboto", "Serif")
 * @param {string} [sortBy] - Sorting criteria: 'alpha' (alphabetical), 'date' (last modified), 'popularity', 'style', 'trending' (default 'popularity')
 * @param {number} [limit] - Max number of font records to return (default 10)
 * @returns {Promise<object>} Google Fonts list report
 */
const resolveGoogleFonts = async (filterQuery = '', sortBy = 'popularity', limit = 10) => {
  try {
    const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('Google Search/Fonts API Key is not configured.');
    }

    logger.info(`GCP Fonts API: Resolving web fonts (filter: "${filterQuery}", sort: "${sortBy}", limit: ${limit})...`);

    const endpoint = 'https://www.googleapis.com/webfonts/v1/webfonts';
    const params = {
      key: apiKey,
      sort: sortBy
    };

    const response = await axios.get(endpoint, { params });
    let items = response.data.items || [];

    // Filter by family name if query is provided
    if (filterQuery) {
      const queryLower = filterQuery.toLowerCase();
      items = items.filter(item => item.family.toLowerCase().includes(queryLower));
    }

    // Limit the results
    const totalMatching = items.length;
    const slicedItems = items.slice(0, limit).map(item => ({
      family: item.family,
      variants: item.variants || [],
      subsets: item.subsets || [],
      version: item.version || '',
      category: item.category || 'sans-serif',
      files: item.files || {}
    }));

    logger.info(`GCP Fonts API: Resolved ${slicedItems.length} fonts out of ${totalMatching} total matches.`);

    return {
      success: true,
      filterQuery,
      sortBy,
      totalCount: totalMatching,
      returnedCount: slicedItems.length,
      fonts: slicedItems
    };
  } catch (err) {
    logger.error('GCP Fonts API Resolution Error:', err);
    throw new Error(`Google Fonts resolution failed: ${err.message}`);
  }
};

export const GcpFontsService = {
  resolveGoogleFonts
};
