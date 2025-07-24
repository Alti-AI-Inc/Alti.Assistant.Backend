import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';

/**
 * Get conversation by conversationId
 * @param {string} conversationId
 * @param {string} userId - Optional user ID for security check
 * @returns {Promise<Object>}
 */
const getConversationById = async (conversationId, userId = null) => {
  try {
    const conversation = await Conversation.findByConversationId(conversationId, userId);
    
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    return conversation;
  } catch (error) {
    logger.error('Error fetching conversation by ID:', error);
    throw error;
  }
};

/**
 * Get conversations for a specific user
 * @param {string} userId
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const getUserConversations = async (userId, options = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = 'active',
      sortBy = 'lastActivity',
      sortOrder = -1,
      search = '',
      category = null,
      is_deep_search = null,
    } = options;

    const skip = (page - 1) * limit;
    
    // Build query
    const query = { userId, status };
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'metadata.tags': { $in: [new RegExp(search, 'i')] } },
      ];
    }
    
    if (category) {
      query['metadata.category'] = category;
    }

    if (is_deep_search !== null) {
      query.is_deep_search = is_deep_search;
    }

    // Get conversations without messages for list view
    const conversations = await Conversation.find(query)
      .sort({ [sortBy]: sortOrder })
      .limit(limit)
      .skip(skip)
      .select('-messages')
      .lean();

    // Get total count for pagination
    const total = await Conversation.countDocuments(query);

    return {
      conversations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    logger.error('Error fetching user conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch conversations');
  }
};

/**
 * Get conversation messages with pagination
 * @param {string} conversationId
 * @param {string} userId
 * @param {Object} options - Query options
 * @returns {Promise<Object>}
 */
const getConversationMessages = async (conversationId, userId, options = {}) => {
  try {
    const { page = 1, limit = 50, beforeDate = null } = options;
    
    const conversation = await Conversation.findByConversationId(conversationId, userId);
    
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    let messages = conversation.messages;
    
    // Filter by date if provided
    if (beforeDate) {
      messages = messages.filter(msg => msg.timestamp < new Date(beforeDate));
    }

    // Sort messages by timestamp (newest first for pagination)
    messages.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMessages = messages.slice(startIndex, endIndex);

    // Reverse to show oldest first in the response
    paginatedMessages.reverse();

    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      messages: paginatedMessages,
      pagination: {
        page,
        limit,
        total: messages.length,
        pages: Math.ceil(messages.length / limit),
        hasNext: endIndex < messages.length,
        hasPrev: page > 1,
      },
    };
  } catch (error) {
    logger.error('Error fetching conversation messages:', error);
    throw error;
  }
};

/**
 * Search conversations by content
 * @param {string} userId
 * @param {string} searchTerm
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
const searchConversations = async (userId, searchTerm, options = {}) => {
  try {
    const { limit = 10, category = null } = options;
    
    const query = {
      userId,
      status: 'active',
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        { 'messages.content': { $regex: searchTerm, $options: 'i' } },
        { 'metadata.tags': { $in: [new RegExp(searchTerm, 'i')] } },
      ],
    };

    if (category) {
      query['metadata.category'] = category;
    }

    const conversations = await Conversation.find(query)
      .sort({ lastActivity: -1 })
      .limit(limit)
      .select('conversationId title lastActivity metadata.category messageCount')
      .lean();

    return conversations;
  } catch (error) {
    logger.error('Error searching conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to search conversations');
  }
};

/**
 * Get conversation statistics for a user
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getConversationStats = async (userId) => {
  try {
    const stats = await Conversation.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalMessages: { $sum: '$messageCount' },
        },
      },
    ]);

    const result = {
      total: 0,
      active: 0,
      archived: 0,
      deleted: 0,
      totalMessages: 0,
    };

    stats.forEach(stat => {
      result[stat._id] = stat.count;
      result.total += stat.count;
      result.totalMessages += stat.totalMessages;
    });

    return result;
  } catch (error) {
    logger.error('Error fetching conversation stats:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch conversation statistics');
  }
};

/**
 * Get conversations by category
 * @param {string} userId
 * @param {string} category
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
const getConversationsByCategory = async (userId, category, options = {}) => {
  try {
    const { limit = 20, sortBy = 'lastActivity', sortOrder = -1 } = options;
    
    const conversations = await Conversation.find({
      userId,
      'metadata.category': category,
      status: 'active',
    })
      .sort({ [sortBy]: sortOrder })
      .limit(limit)
      .select('-messages')
      .lean();

    return conversations;
  } catch (error) {
    logger.error('Error fetching conversations by category:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch conversations by category');
  }
};

/**
 * Check if conversation exists and user has access
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const hasConversationAccess = async (conversationId, userId) => {
  try {
    const conversation = await Conversation.findOne({
      conversationId,
      userId,
    }).select('_id');

    return !!conversation;
  } catch (error) {
    logger.error('Error checking conversation access:', error);
    return false;
  }
};

/**
 * Get recent active conversations for a user
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
const getRecentConversations = async (userId, limit = 5) => {
  try {
    const conversations = await Conversation.find({
      userId,
      status: 'active',
    })
      .sort({ lastActivity: -1 })
      .limit(limit)
      .select('conversationId title lastActivity messageCount')
      .lean();

    return conversations;
  } catch (error) {
    logger.error('Error fetching recent conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch recent conversations');
  }
};

export const conversationHelpers = {
  getConversationById,
  getUserConversations,
  getConversationMessages,
  searchConversations,
  getConversationStats,
  getConversationsByCategory,
  hasConversationAccess,
  getRecentConversations,
};
