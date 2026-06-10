import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// import { ConversationChain } from 'langchain/chains';
import { GeminiAiService } from './gemini.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

const GeminiAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  // If validation failed, immediately send the error response and stop further processing.
  if (errorResponse) {
    return sendResponse(res, {
      statusCode: errorResponse.statusCode || httpStatus.BAD_REQUEST, // Use status from errorResponse or default to BAD_REQUEST
      success: false,
      message: errorResponse.message || 'Validation failed.',
      data: null, // No data on error
    });
  }

  const result = await GeminiAiService.geminiService(sessionId, prompt, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});
const Gemini25PreviewAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  // If validation failed, immediately send the error response and stop further processing.
  if (errorResponse) {
    return sendResponse(res, {
      statusCode: errorResponse.statusCode || httpStatus.BAD_REQUEST, // Use status from errorResponse or default to BAD_REQUEST
      success: false,
      message: errorResponse.message || 'Validation failed.',
      data: null, // No data on error
    });
  }

  const result = await GeminiAiService.gemini25PreviewService(
    sessionId,
    prompt,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

export const GeminiAiController = {
  GeminiAiGetResponse,
  Gemini25PreviewAiGetResponse,
};