import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { Llama4AiServices } from './llama4.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';


const Llama4AiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await Llama4AiServices.Llama4AiGetResponseService(
    prompt,
    userId,
    sessionId,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

export const Llama4AiController = {
  Llama4AiGetResponse,
};
