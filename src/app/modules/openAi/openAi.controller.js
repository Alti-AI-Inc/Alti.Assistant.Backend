import httpStatus from 'http-status';
import { randomUUID } from 'crypto';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// import { ConversationChain } from 'langchain/chains';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { openAIAiServices } from './openAi.service.js';
// The LlamaAiService import is no longer used in this controller after the fix
// for OpenAiGetResponseAnonymously. It can be safely removed if not used elsewhere.
import { LlamaAiService } from '../groq/groq.service.js';

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

const OpenAiGetResponseAnonymously = catchAsync(async (req, res) => {
  const prompt = req.body?.prompt;
  // BUG FIX: Added validation to ensure 'prompt' is provided.
  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required.',
      data: null,
    });
  }

  const sessionId = req.body?.sessionId || randomUUID();

  // BUG FIX: The function 'OpenAiGetResponseAnonymously' was incorrectly calling
  // LlamaAiService.GroqAiGetResponseAnonymousService.
  // It has been corrected to call an OpenAI service method,
  // aligning with the function's name and the module's purpose.
  // This assumes 'openAiAnonymousResponseService' exists in 'openAIAiServices'.
  const responseData = await openAIAiServices.openAiAnonymousResponseService(
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

export const openAIAiController = {
  Gpt4oMiniGetResponse,
  Gpt4NanoGetResponse,
  OpenAiGetResponseAnonymously,
};