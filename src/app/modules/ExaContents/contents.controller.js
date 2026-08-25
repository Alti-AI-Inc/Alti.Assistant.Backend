import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ContentService } from './contents.service.js';

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

const createContentRecord = catchAsync(async (req, res) => {
  const result = await ContentService.createContentRecord(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Content record stored successfully',
    data: result,
  });
});

const getAllContentRecords = catchAsync(async (req, res) => {
  const result = await ContentService.getAllContentRecords(
    req.params.spaceId,
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Content records retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleContentRecord = catchAsync(async (req, res) => {
  const result = await ContentService.getSingleContentRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Content record retrieved successfully',
    data: result,
  });
});

const updateContentRecord = catchAsync(async (req, res) => {
  const result = await ContentService.updateContentRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Content record updated successfully',
    data: result,
  });
});

const deleteContentRecord = catchAsync(async (req, res) => {
  const result = await ContentService.deleteContentRecord(
    req.params.spaceId,
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Content record deleted successfully',
    data: result,
  });
});

export const ContentController = {
  createContentRecord,
  getAllContentRecords,
  getSingleContentRecord,
  updateContentRecord,
  deleteContentRecord,
};
