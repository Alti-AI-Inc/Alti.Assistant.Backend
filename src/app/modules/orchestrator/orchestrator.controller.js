import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { orchestratorService } from './orchestrator.service.js';

const routePrompt = catchAsync(async (req, res) => {
  const { message, prompt, sessionId, conversationId } = req.body;
  const userPrompt = message || prompt;
  // Safely access user ID from the authenticated user object, using optional chaining.
  const userId = req.user?.id || req.user?._id || req.user?.userId;

  // Validate that a user prompt is provided and is a non-empty string.
  if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt message is required and cannot be empty.',
    });
  }

  // Validate that a user ID is available from the authentication context.
  // This prevents operations without a clear user identity, which could lead to security issues.
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN, // Or UNAUTHORIZED if authentication itself failed
      success: false,
      message: 'User ID is missing or invalid. Authentication required.',
    });
  }

  // Further validation for sessionId and conversationId could be added here
  // if they are mandatory or have specific format requirements (e.g., UUIDs).
  // For example:
  // if (sessionId && typeof sessionId !== 'string') {
  //   return sendResponse(res, {
  //     statusCode: httpStatus.BAD_REQUEST,
  //     success: false,
  //     message: 'Session ID must be a string if provided.',
  //   });
  // }

  const result = await orchestratorService.classifyAndDispatch(userPrompt, sessionId, userId, conversationId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Prompt successfully routed and processed.',
    data: result,
  });
});

export const orchestratorController = {
  routePrompt,
};