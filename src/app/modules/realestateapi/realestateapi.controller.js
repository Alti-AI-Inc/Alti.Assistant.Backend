import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import realEstateApiService from './realestateapi.service.js';

const getPropertySearch = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getPropertySearch(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Property search results retrieved successfully',
    data: result,
  });
});

const getPropertyDetail = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getPropertyDetail(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Property details retrieved successfully',
    data: result,
  });
});

const getPropertyDetailBulk = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getPropertyDetailBulk(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bulk property details retrieved successfully',
    data: result,
  });
});

const getMlsSearch = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getMlsSearch(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'MLS search results retrieved successfully',
    data: result,
  });
});

const getMlsDetail = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getMlsDetail(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'MLS details retrieved successfully',
    data: result,
  });
});

const getPropertyAvm = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getPropertyAvm(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Property AVM retrieved successfully',
    data: result,
  });
});

const getPropertyComps = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getPropertyComps(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Property comps retrieved successfully',
    data: result,
  });
});

const getSkipTrace = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getSkipTrace(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Skip trace results retrieved successfully',
    data: result,
  });
});

const getSkipTraceBatch = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getSkipTraceBatch(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Skip trace batch initiated successfully',
    data: result,
  });
});

const getSkipTraceBatchAwait = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getSkipTraceBatchAwait(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Skip trace batch results retrieved successfully',
    data: result,
  });
});

const getInvoluntaryLien = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getInvoluntaryLien(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Involuntary lien details retrieved successfully',
    data: result,
  });
});

const getDemographics = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getDemographics(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Demographics retrieved successfully',
    data: result,
  });
});

const getKeyInfo = catchAsync(async (req, res) => {
  const result = await realEstateApiService.getKeyInfo();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Key info retrieved successfully',
    data: result,
  });
});

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
