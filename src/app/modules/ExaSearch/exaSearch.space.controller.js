import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { SpaceService } from './exaSearch.space.service.js';

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

const createSpace = catchAsync(async (req, res) => {
  const result = await SpaceService.createSpace(
    req.body,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Space created successfully',
    data: result,
  });
});

const getAllSpaces = catchAsync(async (req, res) => {
  const result = await SpaceService.getAllSpaces(
    getAuthenticatedUserId(req),
    req.query
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Spaces retrieved successfully',
    meta: result.meta,
    data: result.data,
  });
});

const getSingleSpace = catchAsync(async (req, res) => {
  const result = await SpaceService.getSingleSpace(
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Space retrieved successfully',
    data: result,
  });
});

const updateSpace = catchAsync(async (req, res) => {
  const result = await SpaceService.updateSpace(
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Space updated successfully',
    data: result,
  });
});

const addMember = catchAsync(async (req, res) => {
  const result = await SpaceService.addMember(
    req.params.id,
    getAuthenticatedUserId(req),
    req.body
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Member added successfully',
    data: result,
  });
});

const removeMember = catchAsync(async (req, res) => {
  const result = await SpaceService.removeMember(
    req.params.id,
    getAuthenticatedUserId(req),
    req.params.memberId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Member removed successfully',
    data: result,
  });
});

const deleteSpace = catchAsync(async (req, res) => {
  const result = await SpaceService.deleteSpace(
    req.params.id,
    getAuthenticatedUserId(req)
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Space deleted successfully',
    data: result,
  });
});

export const SpaceController = {
  createSpace,
  getAllSpaces,
  getSingleSpace,
  updateSpace,
  addMember,
  removeMember,
  deleteSpace,
};
