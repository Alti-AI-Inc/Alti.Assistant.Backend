import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { BrowserUseServices } from './browserUse.service.js';

const runTaskController = catchAsync(async (req, res) => {
  const { prompt, sessionId, structured_output_json } = req.body;
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // Allowing it from req.body.userId creates an IDOR vulnerability where an attacker
  // could potentially initiate tasks for other users if not properly authenticated.
  const userId = req.user?._id;

  if (!userId) {
    // Ensure the user is authenticated before proceeding.
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  if (!prompt) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required field: prompt'
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
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // This userId should be passed to the service layer to ensure the user is authorized
  // to update the status of this specific task/session, preventing IDOR.
  const userId = req.user?._id;

  if (!userId) {
    // Ensure the user is authenticated before proceeding.
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const result = await BrowserUseServices.updateTaskStatusService(
    userId, // Pass userId to the service for authorization
    sessionId,
    taskId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Task status updated.`,
    data: result,
  });
});

const getUserSessionsController = catchAsync(async (req, res) => {
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // Allowing it from req.params.userId creates an IDOR vulnerability where an attacker
  // could potentially retrieve sessions for other users.
  const userId = req.user?._id;
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
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // Allowing it from req.params.userId creates an IDOR vulnerability where an attacker
  // could potentially retrieve sessions for other users.
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const result = await BrowserUseServices.getSessionByIdService(
    sessionId,
    userId, // Pass userId to the service for authorization
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