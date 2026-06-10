import httpStatus from 'http-status';
import logger from '../../../config/logger.js'; // Import the pre-configured Winston logger for structured logging.
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { orchestratorService } from './orchestrator.service.js';

const routePrompt = catchAsync(async (req, res) => {
  const { message, prompt, sessionId, conversationId } = req.body;
  const userPrompt = message || prompt;
  // Safely access user ID from the authenticated user object, using optional chaining.
  const userId = req.user?.id || req.user?._id || req.user?.userId;

  // GCP structured logging: Log the start of the request processing with context.
  // The 'severity' property is automatically recognized by Google Cloud Logging.
  logger.info('Orchestrator routePrompt request received', {
    severity: 'INFO',
    userId,
    sessionId,
    conversationId,
    promptLength: userPrompt?.length || 0,
  });

  // Validate that a user prompt is provided and is a non-empty string.
  if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
    // GCP structured logging: Log validation failures as warnings.
    logger.warn('Validation failed: Prompt message is required and cannot be empty.', {
      severity: 'WARNING',
      userId,
      sessionId,
      conversationId,
      validationError: 'empty_prompt',
    });
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt message is required and cannot be empty.',
    });
  }

  // Validate that a user ID is available from the authentication context.
  // This prevents operations without a clear user identity, which could lead to security issues.
  if (!userId) {
    // GCP structured logging: Log authentication/authorization failures as warnings.
    logger.warn('Validation failed: User ID is missing from request.', {
      severity: 'WARNING',
      sessionId,
      conversationId,
      validationError: 'missing_user_id',
    });
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
  //   logger.warn('Validation failed: Invalid Session ID format.', {
  //     severity: 'WARNING',
  //     userId,
  //     sessionId,
  //     validationError: 'invalid_session_id_format',
  //   });
  //   return sendResponse(res, {
  //     statusCode: httpStatus.BAD_REQUEST,
  //     success: false,
  //     message: 'Session ID must be a string if provided.',
  //   });
  // }

  const result = await orchestratorService.classifyAndDispatch(userPrompt, sessionId, userId, conversationId);

  // GCP structured logging: Log successful processing.
  logger.info('Prompt successfully routed and processed', {
    severity: 'INFO',
    userId,
    sessionId,
    conversationId,
    // Avoid logging the entire 'result' object if it contains sensitive or very large data.
    // Log key identifiers or metadata from the result instead.
    resultType: result?.type, // Example of logging a key piece of data from the result
  });

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