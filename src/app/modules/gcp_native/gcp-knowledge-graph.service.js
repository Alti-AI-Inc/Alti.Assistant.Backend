import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Searches the Google Knowledge Graph API for a target entity (Person, Organization, Place, Movie, etc.).
 * Returns a highly structured entity summary card.
 */
const lookupEntity = async (query, limit = 5, types = [], languages = ['en']) => {
  try {
    const apiKey = config.google_search_api_key || process.env.GOOGLE_SEARCH_API_KEY;

    if (!apiKey) {
      throw new Error('Google Search API Key is not configured.');
    }

    // Ensure limit is a number and within acceptable range (Google API default 20, max 500).
    // Default to 5 if parsing fails or if the value is out of bounds.
    const effectiveLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 5));

    // Ensure types is an array to prevent errors with .join() if a non-array is passed.
    const effectiveTypes = Array.isArray(types) ? types : [];

    // Ensure languages is an array to prevent errors with .join() if a non-array is passed.
    // Re-apply default ['en'] if the provided languages is not an array.
    const effectiveLanguages = Array.isArray(languages) ? languages : ['en'];

    logger.info(`GCP Knowledge Graph: Querying entity "${query}" (limit: ${effectiveLimit}, types: ${JSON.stringify(effectiveTypes)})...`);

    const params = {
      query: query,
      key: apiKey,
      limit: effectiveLimit, // Use the validated and clamped limit
      languages: effectiveLanguages.join(',') // Use the validated languages array
    };

    if (effectiveTypes.length > 0) { // Use the validated types array
      // Types can be specified multiple times or as a comma-separated list
      params.types = effectiveTypes.join(','); // Use the validated types array
    }

    const response = await axios.get('https://kgsearch.googleapis.com/v1/entities:search', { params });
    const elements = response.data.itemListElement || [];

    const entities = elements.map(element => {
      const result = element.result || {};
      const score = element.resultScore || 0;

      return {
        id: result['@id'],
        name: result.name || '',
        types: result['@type'] || [],
        description: result.description || '',
        detailedDescription: {
          body: result.detailedDescription?.articleBody || '',
          url: result.detailedDescription?.url || '',
          license: result.detailedDescription?.license || ''
        },
        image: {
          url: result.image?.contentUrl || '',
          sourceUrl: result.image?.url || ''
        },
        url: result.url || '',
        relevanceScore: score
      };
    });

    logger.info(`GCP Knowledge Graph: Found ${entities.length} entities for "${query}".`);

    return {
      success: true,
      query: query,
      totalCount: entities.length,
      entities: entities
    };
  } catch (err) {
    logger.error('GCP Knowledge Graph Lookup Error:', err);
    throw new Error(`GCP Knowledge Graph Lookup failed: ${err.message}`);
  }
};

export const GcpKnowledgeGraphService = {
  lookupEntity
};