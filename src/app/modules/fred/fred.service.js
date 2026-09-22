import config from '../../../../config/index.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

const makeRequest = async (endpoint, params = {}) => {
  const queryParams = new URLSearchParams({
    api_key: config.fred.key,
    file_type: 'json',
    ...params
  });
  
  const url = `${config.fred.baseUrl}${endpoint}?${queryParams.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        response.status || httpStatus.INTERNAL_SERVER_ERROR,
        result?.error_message || 'Error calling FRED API'
      );
    }
    return result;
  } catch (error) {
    logger.error(`FRED API Error (${endpoint}):`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

export const getSeriesObservations = async (series_id, options = {}) => {
  return await makeRequest('/series/observations', { series_id, ...options });
};

export const searchSeries = async (search_text, options = {}) => {
  return await makeRequest('/series/search', { search_text, ...options });
};

export const getSeriesInfo = async (series_id) => {
  return await makeRequest('/series', { series_id });
};

export default {
  getSeriesObservations,
  searchSeries,
  getSeriesInfo
};
