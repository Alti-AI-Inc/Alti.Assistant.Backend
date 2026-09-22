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

// V2 Endpoints
export const getPropertySearch = async (data) => await makeRequest('/v2/PropertySearch', 'POST', data);
export const getPropertyDetail = async (data) => await makeRequest('/v2/PropertyDetail', 'POST', data);
export const getPropertyDetailBulk = async (data) => await makeRequest('/v2/PropertyDetailBulk', 'POST', data);
export const getPropertyAvmBulk = async (data) => await makeRequest('/v2/PropertyAvmBulk', 'POST', data);
export const getMlsSearch = async (data) => await makeRequest('/v2/MLSSearch', 'POST', data);
export const getMlsDetail = async (data) => await makeRequest('/v2/MLSDetail', 'POST', data);
export const getPropertyAvm = async (data) => await makeRequest('/v2/PropertyAvm', 'POST', data);
export const getPropertyComps = async (data) => await makeRequest('/v2/PropertyComps', 'POST', data);
export const getSkipTrace = async (data) => await makeRequest('/v2/SkipTrace', 'POST', data);
export const getSkipTraceBatch = async (data) => await makeRequest('/v2/SkipTraceBatch', 'POST', data);
export const getSkipTraceBatchAwait = async (data) => await makeRequest('/v2/SkipTraceBatchAwait', 'POST', data);
export const getInvoluntaryLien = async (data) => await makeRequest('/v2/InvoluntaryLien', 'POST', data);
export const getPropertyLiens = async (data) => await makeRequest('/v2/Reports/PropertyLiens', 'POST', data);
export const getDemographics = async (data) => await makeRequest('/v2/Demographics', 'POST', data);
export const getAutocomplete = async (data) => await makeRequest('/v2/Autocomplete', 'POST', data);
export const getAddressVerification = async (data) => await makeRequest('/v2/AddressVerification', 'POST', data);
export const getCsvBuilder = async (data) => await makeRequest('/v2/CSVBuilder', 'POST', data);
export const getChangeFiles = async (data) => await makeRequest('/v2/ChangeFiles', 'POST', data);
export const getMlsPropertyMappingV2 = async (data) => await makeRequest('/v2/MLSPropertyMapping', 'POST', data);
export const getKeyInfo = async () => await makeRequest('/v2/key/info', 'GET');

// V3 Endpoints
export const getMlsSearchV3 = async (data) => await makeRequest('/v3/MLSSearch', 'POST', data);
export const getMlsDetailV3 = async (data) => await makeRequest('/v3/MLSDetail', 'POST', data);
export const getMlsDetailBulkV3 = async (data) => await makeRequest('/v3/MLSDetailBulk', 'POST', data);
export const getMlsAutocompleteV3 = async (data) => await makeRequest('/v3/MLSAutocomplete', 'POST', data);
export const getPropertyCompsV3 = async (data) => await makeRequest('/v3/PropertyComps', 'POST', data);
export const getMlsBoardCoverage = async (data) => await makeRequest('/v3/MLSBoardCoverage', 'POST', data);
export const getMlsPropertyMappingV3 = async (data) => await makeRequest('/v3/MLSPropertyMapping', 'POST', data);

// V1 / Portfolio Endpoints
export const getPropertyParcel = async (data) => await makeRequest('/v1/PropertyParcel', 'POST', data);
export const savedSearchCreate = async (data) => await makeRequest('/v1/PropertyPortfolio/SavedSearch/Create', 'POST', data);
export const savedSearchRetrieve = async (data) => await makeRequest('/v1/PropertyPortfolio/SavedSearch', 'POST', data);
export const savedSearchList = async (data) => await makeRequest('/v1/PropertyPortfolio/SavedSearch/List', 'POST', data);
export const savedSearchUpdate = async (data) => await makeRequest('/v1/PropertyPortfolio/SavedSearch/Update', 'POST', data);
export const savedSearchDelete = async (data) => await makeRequest('/v1/PropertyPortfolio/SavedSearch/Delete', 'POST', data);

export default {
  getPropertySearch,
  getPropertyDetail,
  getPropertyDetailBulk,
  getPropertyAvmBulk,
  getMlsSearch,
  getMlsDetail,
  getPropertyAvm,
  getPropertyComps,
  getSkipTrace,
  getSkipTraceBatch,
  getSkipTraceBatchAwait,
  getInvoluntaryLien,
  getPropertyLiens,
  getDemographics,
  getAutocomplete,
  getAddressVerification,
  getCsvBuilder,
  getChangeFiles,
  getMlsPropertyMappingV2,
  getKeyInfo,
  
  getMlsSearchV3,
  getMlsDetailV3,
  getMlsDetailBulkV3,
  getMlsAutocompleteV3,
  getPropertyCompsV3,
  getMlsBoardCoverage,
  getMlsPropertyMappingV3,

  getPropertyParcel,
  savedSearchCreate,
  savedSearchRetrieve,
  savedSearchList,
  savedSearchUpdate,
  savedSearchDelete
};
