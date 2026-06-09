import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Chatbot from './chatbot.model.js';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

// Recommended indexes for chatbot.model.js to improve query performance:
// 1. For `getChatbots` by userId and isActive, with sorting:
//    ChatbotSchema.index({ userId: 1, isActive: 1, createdAt: -1 });
// 2. For `getChatbots` by shared tenant projects, with sorting:
//    ChatbotSchema.index({ isShared: 1, tenantId: 1, isActive: 1, createdAt: -1 });
// 3. For `getChatbotById`, `updateChatbot`, `deleteChatbot` (if _id is not the only filter):
//    ChatbotSchema.index({ _id: 1, userId: 1, isActive: 1 }); // _id is already indexed by default, but this covers the compound query.

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
    let query;
    if (req && req.tenantId) {
      query = {
        isActive: true,
        $or: [
          { userId }, // The user's personal projects
          { isShared: true, tenantId: req.tenantId } // The team's shared projects
        ]
      };
    } else {
      query = { userId, isActive: true };
    }
    
    // We don't use withTenantFilter here because we need a custom $or that spans across the user's bots and shared tenant bots
    // Added .lean() for performance as we are only reading data and don't need Mongoose document methods.
    const chatbots = await Chatbot.find(query).sort({ createdAt: -1 }).lean();
    return chatbots;
  } catch (error) {
    logger.error('Error fetching chatbots:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch chatbots');
  }
};

const getChatbotById = async (chatbotId, userId, req = null) => {
  try {
    const query = { _id: chatbotId, userId, isActive: true };
    // Added .lean() for performance as we are only reading data and don't need Mongoose document methods.
    const chatbot = await Chatbot.findOne(req ? withTenantFilter(req, query) : query).lean();
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