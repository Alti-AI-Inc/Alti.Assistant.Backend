import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ExaSearchService } from './exaSearch.service.js';

const getAuthenticatedUserId = (req) => {
  const userId = req.user?.id || req.user?._id || req.user?.userId;

  if (!userId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Authenticated user ID is missing from the access token'
    );
  }

  return userId;
};

const createSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaSearchService.createSearchRecord(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Search result stored successfully',
    data: result,
  });
});

const getAllSearchRecords = catchAsync(async (req, res) => {
  const result = await ExaSearchService.getAllSearchRecords(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search results retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaSearchService.getSingleSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result retrieved successfully',
    data: result,
  });
});

const updateSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaSearchService.updateSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result updated successfully',
    data: result,
  });
});

const deleteSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaSearchService.deleteSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result deleted successfully',
    data: result,
  });
});

export const SearchController = {
  createSearchRecord,
  getAllSearchRecords,
  getSingleSearchRecord,
  updateSearchRecord,
  deleteSearchRecord,
};
