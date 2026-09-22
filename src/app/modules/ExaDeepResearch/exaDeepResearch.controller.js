import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ExaDeepResearchService } from './exaDeepResearch.service.js';

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

const createDeepResearchRecord = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.createDeepResearchRecord(
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

const getAllDeepResearchRecords = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.getAllDeepResearchRecords(
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

const getSingleDeepResearchRecord = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.getSingleDeepResearchRecord(
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

const updateDeepResearchRecord = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.updateDeepResearchRecord(
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

const deleteDeepResearchRecord = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.deleteDeepResearchRecord(
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

const createAgentRun = catchAsync(async (req, res) => {
  const { query, ...options } = req.body;
  if (!query) throw new ApiError(httpStatus.BAD_REQUEST, 'Query is required');
  const result = await ExaDeepResearchService.createAgentRun(query, options);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Agent run created successfully',
    data: result,
  });
});

const getAgentRun = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.getAgentRun(req.params.runId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Agent run retrieved successfully',
    data: result,
  });
});

const cancelAgentRun = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.cancelAgentRun(req.params.runId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Agent run cancelled successfully',
    data: result,
  });
});

const stopAgentRun = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.stopAgentRun(req.params.runId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent run stopped (partial results kept)',
    data: result,
  });
});

const deleteAgentRun = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.deleteAgentRun(req.params.runId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent run deleted',
    data: result,
  });
});

const listAgentRuns = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.listAgentRuns({
    cursor: req.query.cursor,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent runs listed',
    data: result,
  });
});

const listAgentRunEvents = catchAsync(async (req, res) => {
  const result = await ExaDeepResearchService.listAgentRunEvents(req.params.runId, {
    cursor: req.query.cursor,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agent run events listed',
    data: result,
  });
});

export const DeepResearchController = {
  createDeepResearchRecord,
  getAllDeepResearchRecords,
  getSingleDeepResearchRecord,
  updateDeepResearchRecord,
  deleteDeepResearchRecord,
  createAgentRun,
  getAgentRun,
  cancelAgentRun,
  stopAgentRun,
  deleteAgentRun,
  listAgentRuns,
  listAgentRunEvents,
};
