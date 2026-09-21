import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { ChatAiService } from './chat.service.js';

const ChatAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  const result = await ChatAiService.chatService(sessionId, prompt, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

export const ChatAiController = {
  ChatAiGetResponse,
  GeminiAiGetResponse: ChatAiGetResponse, // alias
};

export const GeminiAiController = ChatAiController; // alias

export default ChatAiController;
