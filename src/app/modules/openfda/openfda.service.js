import config from '../../../../config/index.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

const makeRequest = async (endpoint, params = {}) => {
  const queryParams = new URLSearchParams({
    api_key: config.openfda.key,
    ...params
  });
  
  const url = `${config.openfda.baseUrl}${endpoint}?${queryParams.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        response.status || httpStatus.INTERNAL_SERVER_ERROR,
        result?.error?.message || 'Error calling OpenFDA API'
      );
    }
    return result;
  } catch (error) {
    logger.error(`OpenFDA API Error (${endpoint}):`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

export const searchDrugs = async (search, options = {}) => {
  return await makeRequest('/drug/label.json', { search, limit: options.limit || 1 });
};

export const searchAdverseEvents = async (search, options = {}) => {
  return await makeRequest('/drug/event.json', { search, limit: options.limit || 1 });
};

export default {
  searchDrugs,
  searchAdverseEvents
};
