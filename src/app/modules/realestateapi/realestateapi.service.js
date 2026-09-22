import config from '../../../../config/index.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.realestateapi.key,
  };
};

const makeRequest = async (endpoint, method, data = null) => {
  const url = `${config.realestateapi.baseUrl}${endpoint}`;
  try {
    const options = {
      method,
      headers: getHeaders(),
    };
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    const response = await fetch(url, options);
    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ApiError(
        response.status || httpStatus.INTERNAL_SERVER_ERROR,
        result?.message || result?.error || 'Error calling RealEstateAPI'
      );
    }

    return result;
  } catch (error) {
    logger.error(`RealEstateAPI Error (${endpoint}):`, error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

export const getPropertySearch = async (data) => {
  return await makeRequest('/PropertySearch', 'POST', data);
};

export const getPropertyDetail = async (data) => {
  return await makeRequest('/PropertyDetail', 'POST', data);
};

export const getPropertyDetailBulk = async (data) => {
  return await makeRequest('/PropertyDetailBulk', 'POST', data);
};

export const getMlsSearch = async (data) => {
  return await makeRequest('/MLSSearch', 'POST', data);
};

export const getMlsDetail = async (data) => {
  return await makeRequest('/MLSDetail', 'POST', data);
};

export const getPropertyAvm = async (data) => {
  return await makeRequest('/PropertyAvm', 'POST', data);
};

export const getPropertyComps = async (data) => {
  return await makeRequest('/PropertyComps', 'POST', data);
};

export const getSkipTrace = async (data) => {
  return await makeRequest('/SkipTrace', 'POST', data);
};

export const getSkipTraceBatch = async (data) => {
  return await makeRequest('/SkipTraceBatch', 'POST', data);
};

export const getSkipTraceBatchAwait = async (data) => {
  return await makeRequest('/SkipTraceBatchAwait', 'POST', data);
};

export const getInvoluntaryLien = async (data) => {
  return await makeRequest('/InvoluntaryLien', 'POST', data);
};

export const getDemographics = async (data) => {
  return await makeRequest('/Demographics', 'POST', data);
};

export const getKeyInfo = async () => {
  return await makeRequest('/key/info', 'GET');
};

export default {
  getPropertySearch,
  getPropertyDetail,
  getPropertyDetailBulk,
  getMlsSearch,
  getMlsDetail,
  getPropertyAvm,
  getPropertyComps,
  getSkipTrace,
  getSkipTraceBatch,
  getSkipTraceBatchAwait,
  getInvoluntaryLien,
  getDemographics,
  getKeyInfo,
};
