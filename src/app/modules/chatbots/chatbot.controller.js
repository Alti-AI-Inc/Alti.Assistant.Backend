import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { chatbotService } from './chatbot.service.js';

const createChatbot = catchAsync(async (req, res) => {
  const result = await chatbotService.createChatbot(req.body, req.user.userId, req);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Chatbot created successfully',
    data: result,
  });
});

const getChatbots = catchAsync(async (req, res) => {
  const result = await chatbotService.getChatbots(req.user.userId, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbots retrieved successfully',
    data: result,
  });
});

const getChatbotById = catchAsync(async (req, res) => {
  const result = await chatbotService.getChatbotById(req.params.id, req.user.userId, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot retrieved successfully',
    data: result,
  });
});

const updateChatbot = catchAsync(async (req, res) => {
  const result = await chatbotService.updateChatbot(req.params.id, req.user.userId, req.body, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot updated successfully',
    data: result,
  });
});

const deleteChatbot = catchAsync(async (req, res) => {
  const result = await chatbotService.deleteChatbot(req.params.id, req.user.userId, req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot deleted successfully',
    data: result,
  });
});

export const chatbotController = {
  createChatbot,
  getChatbots,
  getChatbotById,
  updateChatbot,
  deleteChatbot,
};
