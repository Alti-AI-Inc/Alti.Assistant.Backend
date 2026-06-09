import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { chatbotService } from './chatbot.service.js';

const createChatbot = catchAsync(async (req, res) => {
  // It's generally a bad practice to pass the entire 'req' object to the service layer.
  // Services should only receive the specific data they need to perform their logic,
  // promoting better separation of concerns, testability, and reusability.
  // For creation, typically only the request body and user context are needed.
  const result = await chatbotService.createChatbot(req.body, req.user.userId);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Chatbot created successfully',
    data: result,
  });
});

const getChatbots = catchAsync(async (req, res) => {
  // For retrieving lists of resources, 'req.query' is often used for filtering,
  // pagination, and sorting. Passing 'req.query' explicitly is better than the entire 'req' object.
  const result = await chatbotService.getChatbots(req.user.userId, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbots retrieved successfully',
    data: result,
  });
});

const getChatbotById = catchAsync(async (req, res) => {
  // Only the ID from params and user context are needed to retrieve a specific chatbot.
  const result = await chatbotService.getChatbotById(req.params.id, req.user.userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot retrieved successfully',
    data: result,
  });
});

const updateChatbot = catchAsync(async (req, res) => {
  // Only the ID from params, user context, and update body are needed for updating.
  const result = await chatbotService.updateChatbot(req.params.id, req.user.userId, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot updated successfully',
    data: result,
  });
});

const deleteChatbot = catchAsync(async (req, res) => {
  // Only the ID from params and user context are needed for deletion.
  const result = await chatbotService.deleteChatbot(req.params.id, req.user.userId);
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