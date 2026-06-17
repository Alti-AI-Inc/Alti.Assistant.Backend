import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Searches the Google Knowledge Graph API for a target entity (Person, Organization, Place, Movie, etc.).
 * Returns a highly structured entity summary card.
 *
 * @param {string} query - The text string to search for in the Knowledge Graph.
 * @param {number} [limit=5] - The maximum number of results to return. Clamped between 1 and 500.
 * @param {string[]} [types=[]] - An array of entity types to filter the results by (e.g., 'Person', 'Organization').
 * @param {string[]} [languages=['en']] - An array of language codes to filter the results by (e.g., 'en', 'es').
 * @returns {Promise<object>} A promise that resolves to an object containing the search results.
 * @returns {boolean} return.success - Indicates if the operation was successful.
 * @returns {string} return.query - The original query string.
 * @returns {number} return.totalCount - The total number of entities found.
 * @returns {Array<object>} return.entities - An array of found entities, each with detailed information.
 * @returns {string} return.entities[].id - The unique ID of the entity (e.g., `kg:/g/11c0vmg_0`).
 * @returns {string} return.entities[].name - The primary name of the entity.
 * @returns {string[]} return.entities[].types - An array of types for the entity (e.g., `['Thing', 'Person']`).
 * @returns {string} return.entities[].description - A short description of the entity.
 * @returns {object} return.entities[].detailedDescription - More detailed description information.
 * @returns {string} return.entities[].detailedDescription.body - The main body of the detailed description.
 * @returns {string} return.entities[].detailedDescription.url - URL to the detailed description source.
 * @returns {string} return.entities[].detailedDescription.license - License information for the detailed description.
 * @returns {object} return.entities[].image - Image information for the entity.
 * @returns {string} return.entities[].image.url - URL of the entity's image.
 * @returns {string} return.entities[].image.sourceUrl - URL to the source of the image.
 * @returns {string} return.entities[].url - The canonical URL for the entity (e.g., Wikipedia page).
 * @returns {number} return.entities[].relevanceScore - A score indicating the relevance of the entity to the query.
 * @throws {Error} If the Google Search API Key is not configured or if the API call fails.
 */
const lookupEntity = async (query, limit = 5, types = [], languages = ['en']) => {
  try {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY || config.google_search_api_key;

    if (!apiKey) {
      throw new Error('Google Search API Key is not configured.');
    }

    // Ensure limit is a number and within acceptable range (Google API default 20, max 500).
    // Default to 5 if parsing fails or if the value is out of bounds.
    const parsedLimit = parseInt(limit, 10);
    const effectiveLimit = Math.max(1, Math.min(500, isNaN(parsedLimit) ? 5 : parsedLimit));

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

/**
 * @namespace GcpKnowledgeGraphService
 * @description Provides methods for interacting with the Google Knowledge Graph API.
 * This service allows searching for entities and retrieving structured information about them.
 */
export const GcpKnowledgeGraphService = {
  lookupEntity
};