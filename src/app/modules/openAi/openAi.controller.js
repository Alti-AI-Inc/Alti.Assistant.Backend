import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// import { ConversationChain } from 'langchain/chains';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { openAIAiServices } from './openAi.service.js';

const Gpt4oMiniGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await openAIAiServices.openAiResponseService(
    prompt,
    userId,
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

const Gpt4NanoGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await openAIAiServices.openAi4NanoResponseService(
    prompt,
    userId,
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

export const openAIAiController = {
  Gpt4oMiniGetResponse,
  Gpt4NanoGetResponse,
};
