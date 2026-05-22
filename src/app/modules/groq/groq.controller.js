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
  const prompt = req.body?.prompt;
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
  // const id = req.params?.userId;
  // logger.info(id, 'session');
  const userId = req.user?._id;
  console.log(userId, 'userId from token in controller');
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
  const id = req.params?.sessionId;
  // logger.info(id, 'session');

  const responseData = await LlamaAiService.getAiResponsesBySession(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

const deleteOneAiSession = catchAsync(async (req, res) => {
  const id = req.params?.objectId;
  const result = await LlamaAiService.deleteOneLlamaAiSession(id);
  // logger.info(result, 'resultttt');
  if (!result.success) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
    success: true,
    message: result?.message,
    data: result.message,
  });
});

const deleteAllAiSessions = catchAsync(async (req, res) => {
  // const id = req.params?.userId;
  const userId = req.user?._id;
  console.log(userId, 'userId from token in controller');
  const result = await LlamaAiService.deleteAllAiSessionsService(userId);
  // logger.info(result, 'resultttt');

  if (!result.success) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.NO_CONTENT,
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
