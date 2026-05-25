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

    logger.info(`GCP Knowledge Graph: Querying entity "${query}" (limit: ${limit}, types: ${JSON.stringify(types)})...`);

    const params = {
      query: query,
      key: apiKey,
      limit: limit,
      languages: languages.join(',')
    };

    if (types && types.length > 0) {
      // Types can be specified multiple times or as a comma-separated list
      params.types = types.join(',');
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
