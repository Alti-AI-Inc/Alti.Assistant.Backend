import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { BrowserUseServices } from './browserUse.service.js';

const runTaskController = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, structured_output_json } = req.body;

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
    structured_output_json
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
  // const userId = req.user._id; // Assuming auth middleware places user object on req
  const { userId } = req.params; // Assuming auth middleware places user object on req
  const result = await BrowserUseServices.getSessionsForUserService(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Sessions retrieved successfully.',
    data: result,
  });
});

const getSessionByIdController = catchAsync(async (req, res) => {
  const { sessionId, userId } = req.params;
  // const userId = req.user._id; // From auth middleware
  const result = await BrowserUseServices.getSessionByIdService(
    sessionId,
    userId
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
