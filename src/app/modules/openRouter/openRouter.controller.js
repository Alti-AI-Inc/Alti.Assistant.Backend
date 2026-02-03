import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { OpenRouterService } from './openRouter.service.js';

const getModelDetails = catchAsync(async (req, res) => {
  const result = await OpenRouterService.getModelDetailsService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Model Details Successfully',
    data: result,
  });
});
const getSupportedModelName = catchAsync(async (req, res) => {
  const result = await OpenRouterService.getSupportedModelNameService();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Model Name',
    data: result,
  });
});

const sendPrompt = async (req, res) => {
  const { model, prompt,userId } = req.body;
  const sessionId = req.body?.sessionId || randomUUID();
  const reply = await OpenRouterService.runOpenRouterModel({
    sessionId,
    userId,
    model,
    prompt,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Model Name',
    data: reply,
  });
};

const getSessionHistory = async (req, res) => {
  const { sessionId } = req.params;
  const messages = await OpenRouterService.getSessionMessages(sessionId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Model Name',
    data: messages,
  });
};

const deleteSessionData = async (req, res) => {
  const { sessionId } = req.params;
  await OpenRouterService.deleteSession(sessionId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Session deleted',
  });
};

export const OpenRouterController = {
  getModelDetails,
  getSupportedModelName,
  sendPrompt,
  getSessionHistory,
  deleteSessionData,
};
