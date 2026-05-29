import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Chatbot from './chatbot.model.js';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

const createChatbot = async (chatbotData, userId, req = null) => {
  try {
    const payload = { ...chatbotData, userId };
    const chatbot = new Chatbot(req ? withTenantContext(req, payload) : payload);
    await chatbot.save();
    logger.info(`Chatbot created: ${chatbot._id} for user: ${userId}`);
    return chatbot;
  } catch (error) {
    logger.error('Error creating chatbot:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create chatbot');
  }
};

const getChatbots = async (userId, req = null) => {
  try {
    const query = { userId, isActive: true };
    const chatbots = await Chatbot.find(req ? withTenantFilter(req, query) : query).sort({ createdAt: -1 });
    return chatbots;
  } catch (error) {
    logger.error('Error fetching chatbots:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch chatbots');
  }
};

const getChatbotById = async (chatbotId, userId, req = null) => {
  try {
    const query = { _id: chatbotId, userId, isActive: true };
    const chatbot = await Chatbot.findOne(req ? withTenantFilter(req, query) : query);
    if (!chatbot) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chatbot not found');
    }
    return chatbot;
  } catch (error) {
    logger.error('Error fetching chatbot:', error);
    throw error;
  }
};

const updateChatbot = async (chatbotId, userId, updateData, req = null) => {
  try {
    const query = { _id: chatbotId, userId, isActive: true };
    const chatbot = await Chatbot.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!chatbot) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chatbot not found');
    }
    logger.info(`Chatbot updated: ${chatbotId}`);
    return chatbot;
  } catch (error) {
    logger.error('Error updating chatbot:', error);
    throw error;
  }
};

const deleteChatbot = async (chatbotId, userId, req = null) => {
  try {
    const query = { _id: chatbotId, userId };
    const chatbot = await Chatbot.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      { isActive: false },
      { new: true }
    );
    if (!chatbot) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chatbot not found');
    }
    logger.info(`Chatbot deleted: ${chatbotId}`);
    return { message: 'Chatbot deleted successfully' };
  } catch (error) {
    logger.error('Error deleting chatbot:', error);
    throw error;
  }
};

export const chatbotService = {
  createChatbot,
  getChatbots,
  getChatbotById,
  updateChatbot,
  deleteChatbot,
};
