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

/**
 * Creates a new chatbot for a specific user.
 * Incorporates tenant context if a request object is provided.
 *
 * @param {object} chatbotData - The data for the new chatbot.
 * @param {string} userId - The ID of the user creating the chatbot.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the created chatbot object.
 * @throws {ApiError} If there is an internal server error during chatbot creation.
 */
const createChatbot = async (chatbotData, userId, req = null) => {
  try {
    const payload = { ...chatbotData, userId };
    const chatbot = new Chatbot(req ? withTenantContext(req, payload) : payload);
    await chatbot.save();
    logger.info(`Chatbot created: ${chatbot._id} for user: ${userId}`);
    return chatbot.toObject();
  } catch (error) {
    logger.error('Error creating chatbot:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create chatbot');
  }
};

/**
 * Retrieves a list of chatbots for a given user.
 * If a tenant ID is present in the request, it also includes shared chatbots for that tenant.
 *
 * @param {string} userId - The ID of the user whose chatbots are to be retrieved.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of chatbot objects.
 * @throws {ApiError} If there is an internal server error during chatbot retrieval.
 */
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

/**
 * Retrieves a single chatbot by its ID for a specific user.
 * Applies tenant filtering if a request object is provided.
 *
 * @param {string} chatbotId - The ID of the chatbot to retrieve.
 * @param {string} userId - The ID of the user who owns the chatbot.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the chatbot object.
 * @throws {ApiError} If the chatbot is not found (NOT_FOUND) or an internal server error occurs.
 */
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

/**
 * Updates an existing chatbot by its ID for a specific user.
 * Applies tenant filtering if a request object is provided.
 *
 * @param {string} chatbotId - The ID of the chatbot to update.
 * @param {string} userId - The ID of the user who owns the chatbot.
 * @param {object} updateData - The data to update the chatbot with.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to the updated chatbot object.
 * @throws {ApiError} If the chatbot is not found (NOT_FOUND) or an internal server error occurs.
 */
const updateChatbot = async (chatbotId, userId, updateData, req = null) => {
  try {
    const query = { _id: chatbotId, userId, isActive: true };
    // Added .lean() to avoid overhead of Mongoose document instantiation.
    const chatbot = await Chatbot.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();
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

/**
 * Soft deletes a chatbot by setting its `isActive` status to `false`.
 * Applies tenant filtering if a request object is provided.
 *
 * @param {string} chatbotId - The ID of the chatbot to delete.
 * @param {string} userId - The ID of the user who owns the chatbot.
 * @param {import('express').Request | null} [req=null] - The Express request object, used for tenant context.
 * @returns {Promise<object>} A promise that resolves to an object with a success message.
 * @throws {ApiError} If the chatbot is not found (NOT_FOUND) or an internal server error occurs.
 */
const deleteChatbot = async (chatbotId, userId, req = null) => {
  try {
    const query = { _id: chatbotId, userId };
    // Optimized to only select `_id` and use `.lean()` since we only check for existence and do not return the document.
    const chatbot = await Chatbot.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      { isActive: false }
    ).select('_id').lean();
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

/**
 * @typedef {object} ChatbotService
 * @property {function(object, string, import('express').Request | null): Promise<object>} createChatbot - Creates a new chatbot.
 * @property {function(string, import('express').Request | null): Promise<Array<object>>} getChatbots - Retrieves a list of chatbots.
 * @property {function(string, string, import('express').Request | null): Promise<object>} getChatbotById - Retrieves a single chatbot by ID.
 * @property {function(string, string, object, import('express').Request | null): Promise<object>} updateChatbot - Updates an existing chatbot.
 * @property {function(string, string, import('express').Request | null): Promise<object>} deleteChatbot - Soft deletes a chatbot.
 */

/**
 * Exports an object containing all chatbot-related service functions.
 * @type {ChatbotService}
 */
export const chatbotService = {
  createChatbot,
  getChatbots,
  getChatbotById,
  updateChatbot,
  deleteChatbot,
};