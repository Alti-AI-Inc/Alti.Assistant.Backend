import config from '../../../../config/index.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export const searchPapers = async (query, options = {}) => {
  const queryParams = new URLSearchParams({
    search_query: query,
    start: options.start || 0,
    max_results: options.max_results || 10,
    sortBy: options.sortBy || 'relevance',
    sortOrder: options.sortOrder || 'descending',
  });
  
  const url = `${config.arxiv.baseUrl}/query?${queryParams.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new ApiError(response.status || httpStatus.INTERNAL_SERVER_ERROR, 'Error calling arXiv API');
    }
    const xmlText = await response.text();
    const result = parser.parse(xmlText);
    
    return result;
  } catch (error) {
    logger.error(`arXiv API Error:`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

export default { searchPapers };
