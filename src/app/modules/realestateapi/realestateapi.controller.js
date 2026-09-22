import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import realEstateApiService from './realestateapi.service.js';

const createHandler = (serviceFn, successMessage) => catchAsync(async (req, res) => {
  const result = await serviceFn(req.method === 'GET' ? undefined : req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: successMessage,
    data: result,
  });
});

export default {
  // V2 Handlers
  getPropertySearch: createHandler(realEstateApiService.getPropertySearch, 'Property search results retrieved successfully'),
  getPropertyDetail: createHandler(realEstateApiService.getPropertyDetail, 'Property details retrieved successfully'),
  getPropertyDetailBulk: createHandler(realEstateApiService.getPropertyDetailBulk, 'Bulk property details retrieved successfully'),
  getPropertyAvmBulk: createHandler(realEstateApiService.getPropertyAvmBulk, 'Bulk property AVM retrieved successfully'),
  getMlsSearch: createHandler(realEstateApiService.getMlsSearch, 'MLS search results retrieved successfully'),
  getMlsDetail: createHandler(realEstateApiService.getMlsDetail, 'MLS details retrieved successfully'),
  getPropertyAvm: createHandler(realEstateApiService.getPropertyAvm, 'Property AVM retrieved successfully'),
  getPropertyComps: createHandler(realEstateApiService.getPropertyComps, 'Property comps retrieved successfully'),
  getSkipTrace: createHandler(realEstateApiService.getSkipTrace, 'Skip trace results retrieved successfully'),
  getSkipTraceBatch: createHandler(realEstateApiService.getSkipTraceBatch, 'Skip trace batch initiated successfully'),
  getSkipTraceBatchAwait: createHandler(realEstateApiService.getSkipTraceBatchAwait, 'Skip trace batch results retrieved successfully'),
  getInvoluntaryLien: createHandler(realEstateApiService.getInvoluntaryLien, 'Involuntary lien details retrieved successfully'),
  getPropertyLiens: createHandler(realEstateApiService.getPropertyLiens, 'Property liens retrieved successfully'),
  getDemographics: createHandler(realEstateApiService.getDemographics, 'Demographics retrieved successfully'),
  getAutocomplete: createHandler(realEstateApiService.getAutocomplete, 'Autocomplete results retrieved successfully'),
  getAddressVerification: createHandler(realEstateApiService.getAddressVerification, 'Address verification retrieved successfully'),
  getCsvBuilder: createHandler(realEstateApiService.getCsvBuilder, 'CSV builder request processed successfully'),
  getChangeFiles: createHandler(realEstateApiService.getChangeFiles, 'Change files retrieved successfully'),
  getMlsPropertyMappingV2: createHandler(realEstateApiService.getMlsPropertyMappingV2, 'MLS property mapping (V2) retrieved successfully'),
  getKeyInfo: createHandler(realEstateApiService.getKeyInfo, 'Key info retrieved successfully'),

  // V3 Handlers
  getMlsSearchV3: createHandler(realEstateApiService.getMlsSearchV3, 'MLS search (V3) results retrieved successfully'),
  getMlsDetailV3: createHandler(realEstateApiService.getMlsDetailV3, 'MLS details (V3) retrieved successfully'),
  getMlsDetailBulkV3: createHandler(realEstateApiService.getMlsDetailBulkV3, 'Bulk MLS details (V3) retrieved successfully'),
  getMlsAutocompleteV3: createHandler(realEstateApiService.getMlsAutocompleteV3, 'MLS autocomplete (V3) retrieved successfully'),
  getPropertyCompsV3: createHandler(realEstateApiService.getPropertyCompsV3, 'Property comps (V3) retrieved successfully'),
  getMlsBoardCoverage: createHandler(realEstateApiService.getMlsBoardCoverage, 'MLS board coverage retrieved successfully'),
  getMlsPropertyMappingV3: createHandler(realEstateApiService.getMlsPropertyMappingV3, 'MLS property mapping (V3) retrieved successfully'),

  // V1 / Portfolio Handlers
  getPropertyParcel: createHandler(realEstateApiService.getPropertyParcel, 'Property parcel retrieved successfully'),
  savedSearchCreate: createHandler(realEstateApiService.savedSearchCreate, 'Saved search created successfully'),
  savedSearchRetrieve: createHandler(realEstateApiService.savedSearchRetrieve, 'Saved search retrieved successfully'),
  savedSearchList: createHandler(realEstateApiService.savedSearchList, 'Saved searches listed successfully'),
  savedSearchUpdate: createHandler(realEstateApiService.savedSearchUpdate, 'Saved search updated successfully'),
  savedSearchDelete: createHandler(realEstateApiService.savedSearchDelete, 'Saved search deleted successfully'),
};
