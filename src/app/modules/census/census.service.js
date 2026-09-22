import config from '../../../../config/index.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

const makeRequest = async (datasetPath, params = {}) => {
  const queryParams = new URLSearchParams({
    key: config.census.key,
    ...params
  });
  
  const url = `${config.census.baseUrl}${datasetPath}?${queryParams.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET' });
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        response.status || httpStatus.INTERNAL_SERVER_ERROR,
        result?.error || 'Error calling US Census API'
      );
    }
    return result;
  } catch (error) {
    logger.error(`Census API Error (${datasetPath}):`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

export const getPopulationData = async (year, state, county) => {
  return await makeRequest(`/${year}/pep/population`, {
    get: 'POP_2020,NAME',
    for: county ? `county:${county}` : `state:${state || '*'}`,
    in: county ? `state:${state}` : undefined
  });
};

export const getEconomicData = async (year, state) => {
  return await makeRequest(`/${year}/cbp`, {
    get: 'ESTAB,EMP,PAYANN',
    for: `state:${state || '*'}`
  });
};

export default {
  getPopulationData,
  getEconomicData
};
