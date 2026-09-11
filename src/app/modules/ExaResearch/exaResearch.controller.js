import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ExaResearchService } from './exaResearch.service.js';

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
  const result = await ExaResearchService.createSearchRecord(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Webset created — search is running',
    data: result,
  });
});

const getAllSearchRecords = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getAllSearchRecords(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search sessions retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.getSingleSearchRecord(
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

// Manually refreshes a record from Exa — fallback path for when the webhook
// hasn't delivered yet (or isn't configured, e.g. local dev without a public URL).
const syncSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.syncSearchRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Search result synced successfully',
    data: result,
  });
});

const updateSearchRecord = catchAsync(async (req, res) => {
  const result = await ExaResearchService.updateSearchRecord(
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
  const result = await ExaResearchService.deleteSearchRecord(
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

export const ResearchController = {
  createSearchRecord,
  getAllSearchRecords,
  getSingleSearchRecord,
  syncSearchRecord,
  updateSearchRecord,
  deleteSearchRecord,
};