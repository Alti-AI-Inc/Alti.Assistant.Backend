import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { SpaceService } from './space.service.js';

const userId = (req) => {
  const id = req.user?.id || req.user?._id || req.user?.userId;
  if (!id) throw new ApiError(httpStatus.UNAUTHORIZED, 'Authenticated user ID is missing from the access token');
  return id;
};
const respond = (res, statusCode, message, data, meta) => sendResponse(res, { success: true, statusCode, message, data, ...(meta && { meta }) });

const createSpace = catchAsync(async (req, res) => respond(res, httpStatus.CREATED, 'Space created successfully', await SpaceService.createSpace(req.body, userId(req))));
const getAllSpaces = catchAsync(async (req, res) => { const result = await SpaceService.getAllSpaces(userId(req), req.query); respond(res, httpStatus.OK, 'Spaces retrieved successfully', result.data, result.meta); });
const getSingleSpace = catchAsync(async (req, res) => respond(res, httpStatus.OK, 'Space retrieved successfully', await SpaceService.getSingleSpace(req.params.id, userId(req))));
const updateSpace = catchAsync(async (req, res) => respond(res, httpStatus.OK, 'Space updated successfully', await SpaceService.updateSpace(req.params.id, userId(req), req.body)));
const addMember = catchAsync(async (req, res) => respond(res, httpStatus.OK, 'Member added successfully', await SpaceService.addMember(req.params.id, userId(req), req.body)));
const removeMember = catchAsync(async (req, res) => respond(res, httpStatus.OK, 'Member removed successfully', await SpaceService.removeMember(req.params.id, userId(req), req.params.memberId)));
const deleteSpace = catchAsync(async (req, res) => respond(res, httpStatus.OK, 'Space deleted successfully', await SpaceService.deleteSpace(req.params.id, userId(req))));

export const SpaceController = { createSpace, getAllSpaces, getSingleSpace, updateSpace, addMember, removeMember, deleteSpace };