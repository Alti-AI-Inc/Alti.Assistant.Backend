import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LlamaAiService } from './groq.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

// Active endpoints — all redirected to Google Gemini via groq.service.js


const GroqAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  logger.info('✅ Request received at /groq:', req.body); // log incoming request
  const result = await LlamaAiService.getAiResponsesGroqService(
    prompt,
    userId,
    sessionId
  );
  // logger.info('✅ Service result:', result); // log result
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

const GroqAiGetResponseAnonymously = catchAsync(async (req, res) => {
  // Validate prompt input for robustness
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    const error = new Error('Prompt is required and must be a non-empty string.');
    error.statusCode = httpStatus.BAD_REQUEST; // Custom property for catchAsync to use
    throw error;
  }

  const sessionId = req.body?.sessionId || randomUUID(); // Fixed session for anonymous users

  const responseData = await LlamaAiService.GroqAiGetResponseAnonymousService(
    prompt,
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: responseData,
  });
});

const LlamaAiGetResponseFromDbByUserId = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  // Log userId for debugging purposes, consider using logger.debug in production
  console.log(userId, 'userId from token in controller');

  // Ensure userId is present (should be handled by auth middleware, but good to be explicit)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  const responseData =
    await LlamaAiService.getAiResponsesByUserIdService(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

const LlamaAiGetResponseFromDbBySessionId = catchAsync(async (req, res) => {
  const sessionId = req.params?.sessionId;
  const userId = req.user?._id; // Get userId from authenticated user for ownership check

  // Ensure sessionId is provided
  if (!sessionId) {
    const error = new Error('Session ID is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }

  // Ensure userId is present for authenticated access (prevents IDOR)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  // Pass userId to the service to enforce ownership check and prevent IDOR
  const responseData = await LlamaAiService.getAiResponsesBySession(sessionId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

const deleteOneAiSession = catchAsync(async (req, res) => {
  const objectId = req.params?.objectId; // Renamed 'id' to 'objectId' for clarity
  const userId = req.user?._id; // Get userId from authenticated user for ownership check

  // Ensure objectId is provided
  if (!objectId) {
    const error = new Error('Object ID is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }

  // Ensure userId is present for authenticated access (prevents IDOR)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  // Pass userId to the service to enforce ownership check and prevent IDOR
  const result = await LlamaAiService.deleteOneLlamaAiSession(objectId, userId);
  // logger.info(result, 'resultttt');
  if (!result.success) {
    // If the service indicates failure (e.g., not found or not authorized)
    // it's better to return a more specific status code like NOT_FOUND or FORBIDDEN
    // depending on the reason for failure. Assuming INTERNAL_SERVER_ERROR for generic service failure.
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  // Changed to OK (200) as a body is being sent, which is not standard for NO_CONTENT (204)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result?.message || 'Session deleted successfully', // Provide a default message
    data: result,
  });
});

const deleteAllAiSessions = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  // Log userId for debugging purposes, consider using logger.debug in production
  console.log(userId, 'userId from token in controller');

  // Ensure userId is present (should be handled by auth middleware, but good to be explicit)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  const result = await LlamaAiService.deleteAllAiSessionsService(userId);
  // logger.info(result, 'resultttt');

  if (!result.success) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  // Changed to OK (200) as a body is being sent, which is not standard for NO_CONTENT (204)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete All Successfully',
    data: result,
  });
});

export const LlamaAiController = {
  GroqAiGetResponse,
  GroqAiGetResponseAnonymously,
  LlamaAiGetResponseFromDbByUserId,
  LlamaAiGetResponseFromDbBySessionId,
  deleteOneAiSession,
  deleteAllAiSessions,
};