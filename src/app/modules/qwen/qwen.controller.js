// import { Serper } from 'serper';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { QwenAiServices } from './qwen.service.js';

const QwenAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  // Initialize session memory for conversation history
  const result = await QwenAiServices.QwenAiGetResponseService(
    prompt,
    userId,
    sessionId
  );
  logger.info('✅ Service result:', result); // log result
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

const QwenQWQAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  // Initialize session memory for conversation history
  const result = await QwenAiServices.QwenQWQAiGetResponseService(
    prompt,
    userId,
    sessionId
  );
  logger.info('✅ Service result:', result); // log result
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

export const QwenAiController = {
  QwenAiGetResponse,
  QwenQWQAiGetResponse,
};
