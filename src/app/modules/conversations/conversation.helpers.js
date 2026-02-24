import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';

/**
 * Get conversation by conversationId
 * @param {string} conversationId
 * @param {string} userId - Optional user ID for security check
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getConversationById = async (conversationId, userId = null, req = null) => {
  try {
    console.log("Fetching conversation with ID:", conversationId, "for user:", userId);
    // Build query with tenant filtering
    const query = { conversationId };
    if (userId) {
      query.userId = userId;
    }
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, query) : query
    );

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    console.log("Fetched conversation:", conversation);
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getUserConversations = async (userId, options = {}, req = null) => {
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
    console.log('Check currentTenantId in getUserConversations:', req && req.user ? withTenantFilter(req, query) : 'No req or user');
    // Get conversations without messages for list view
    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
      .sort({ [sortBy]: sortOrder })
      .limit(limit)
      .skip(skip)
      .select('-messages')
      .lean();

    // Get total count for pagination
    const total = await Conversation.countDocuments(
      req ? withTenantFilter(req, query) : query
    );

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getConversationMessages = async (conversationId, userId, options = {}, req = null) => {
  try {
    const { page = 1, limit = 50, beforeDate = null } = options;

    const query = { conversationId, userId };
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, query) : query
    );

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Array>}
 */
const searchConversations = async (userId, searchTerm, options = {}, req = null) => {
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

    console.log('Search Query:', JSON.stringify(query, null, 2));


    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
      .sort({ lastActivity: -1 })
      .limit(limit)
      .lean();

    return conversations;
  } catch (error) {
    logger.error('Error searching conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to search conversations');
  }
};

const getAllSavedConversations = async (userId, limit = 20, page = 1, req = null) => {
  try {
    const query = {
      userId,
      is_saved: true,
    };
    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
      .sort({ lastActivity: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    const total = await Conversation.countDocuments(
      req ? withTenantFilter(req, query) : query
    );

    return {
      conversations,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: (page * limit) < total,
      hasPrev: page > 1,
    };
  } catch (error) {
    logger.error('Error fetching all saved conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch saved conversations');
  }
};



/**
 * Get conversation statistics for a user
 * @param {string} userId
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getConversationStats = async (userId, req = null) => {
  try {
    const pipeline = [
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalMessages: { $sum: '$messageCount' },
        },
      },
    ];

    // Apply tenant filtering using withTenantPipeline if req available
    const tenantPipeline = req
      ? (await import('../../helpers/tenantQuery.js')).withTenantPipeline(req, pipeline)
      : pipeline;

    const stats = await Conversation.aggregate(tenantPipeline);

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Array>}
 */
const getConversationsByCategory = async (userId, category, options = {}, req = null) => {
  try {
    const { limit = 20, sortBy = 'lastActivity', sortOrder = -1 } = options;

    const query = {
      userId,
      'metadata.category': category,
      status: 'active',
    };

    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<boolean>}
 */
const hasConversationAccess = async (conversationId, userId, req = null) => {
  try {
    const query = {
      conversationId,
      userId,
    };
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, query) : query
    ).select('_id');

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Array>}
 */
const getRecentConversations = async (userId, limit = 5, req = null) => {
  try {
    const query = {
      userId,
      status: 'active',
    };
    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
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
  getAllSavedConversations,
};
