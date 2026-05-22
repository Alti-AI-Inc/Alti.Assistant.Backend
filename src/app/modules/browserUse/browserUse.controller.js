import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { BrowserUseServices } from './browserUse.service.js';

const runTaskController = catchAsync(async (req, res) => {
  const { prompt, sessionId, structured_output_json } = req.body;
  const userId = req.user?._id || req.body.userId;

  if (!prompt || !userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: prompt, userId'
    );
  }

  const result = await BrowserUseServices.initiateTaskInSessionService(
    userId,
    sessionId, // This will be null/undefined for a new session
    prompt,
    structured_output_json,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task initiated successfully.',
    data: result, // Send the whole session object back
  });
});

const getTaskStatusController = catchAsync(async (req, res) => {
  const { sessionId, taskId } = req.params;
  const result = await BrowserUseServices.updateTaskStatusService(
    sessionId,
    taskId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Task status updated.`,
    data: result,
  });
});

const getUserSessionsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.params.userId;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }
  
  const result = await BrowserUseServices.getSessionsForUserService(userId, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Sessions retrieved successfully.',
    data: result,
  });
});

const getSessionByIdController = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user?._id || req.params.userId;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const result = await BrowserUseServices.getSessionByIdService(
    sessionId,
    userId,
    req
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Session retrieved successfully.',
    data: result,
  });
});

export const BrowserUseController = {
  runTaskController,
  getTaskStatusController,
  getUserSessionsController,
  getSessionByIdController,
};
