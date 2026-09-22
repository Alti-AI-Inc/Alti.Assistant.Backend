import config from '../../../../config/index.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

const makeRequest = async (endpoint, params = {}) => {
  const queryParams = new URLSearchParams({
    api_key: config.congress.key,
    format: 'json',
    ...params
  });
  
  const url = `${config.congress.baseUrl}${endpoint}?${queryParams.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        response.status || httpStatus.INTERNAL_SERVER_ERROR,
        result?.error || 'Error calling Congress API'
      );
    }
    return result;
  } catch (error) {
    logger.error(`Congress API Error (${endpoint}):`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

export const getBill = async (congress, billType, billNumber) => {
  return await makeRequest(`/bill/${congress}/${billType}/${billNumber}`);
};

export const getRecentBills = async (options = {}) => {
  return await makeRequest('/bill', options);
};

export const getMembers = async (options = {}) => {
  return await makeRequest('/member', options);
};

export default {
  getBill,
  getRecentBills,
  getMembers
};
