import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';
import { withTenantFilter, withTenantPipeline } from '../../helpers/tenantQuery.js'; // Added withTenantPipeline

/**
 * Get conversation by conversationId
 * @param {string} conversationId
 * @param {string} userId - User ID for security check (now mandatory)
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getConversationById = async (
  conversationId,
  userId, // Made userId mandatory for security
  req = null
) => {
  try {
    // Build query with tenant filtering and mandatory userId for security
    const query = { conversationId, userId };
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, query) : query
    );

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

    // Get conversations without messages for list view
    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
      .sort({ [sortBy]: sortOrder })
      .limit(limit)
      .skip(skip)
      .select('-messages');

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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch conversations'
    );
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
const getConversationMessages = async (
  conversationId,
  userId,
  options = {},
  req = null
) => {
  try {
    const { page = 1, limit = 50, beforeDate = null } = options;
    const skip = (page - 1) * limit;

    const baseQuery = { conversationId, userId };
    const finalQuery = req ? withTenantFilter(req, baseQuery) : baseQuery;

    // First, verify conversation existence and get its metadata
    const conversationMetadata = await Conversation.findOne(finalQuery)
      .select('conversationId title')
      .lean(); // Use lean for performance

    if (!conversationMetadata) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Now, build a pipeline to get paginated messages efficiently using aggregation
    const messagePipeline = [
      { $match: finalQuery }, // Match the specific conversation
      {
        $project: {
          _id: 0, // Exclude _id from the root document
          messages: {
            $filter: {
              input: '$messages',
              as: 'msg',
              cond: beforeDate ? { $lt: ['$$msg.timestamp', new Date(beforeDate)] } : true,
            },
          },
        },
      },
      { $unwind: '$messages' }, // Deconstruct the filtered messages array
      { $sort: { 'messages.timestamp': -1 } }, // Sort newest first for pagination logic
      {
        $facet: {
          metadata: [
            { $count: 'total' } // Count total filtered messages
          ],
          data: [
            { $skip: skip }, // Apply pagination
            { $limit: limit },
            { $sort: { 'messages.timestamp': 1 } }, // Re-sort oldest first for response
            { $replaceRoot: { newRoot: '$messages' } } // Promote the message subdocument to the root
          ]
        }
      }
    ];

    const [messageResult] = await Conversation.aggregate(messagePipeline);

    const paginatedMessages = messageResult.data || [];
    const total = messageResult.metadata.length > 0 ? messageResult.metadata[0].total : 0;

    return {
      conversationId: conversationMetadata.conversationId,
      title: conversationMetadata.title,
      messages: paginatedMessages,
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
const searchConversations = async (
  userId,
  searchTerm,
  options = {},
  req = null
) => {
  try {
    const { limit = 10, category = null } = options;

    const query = {
      userId,
      status: 'active',
      $or: [
        { title: { $regex: searchTerm, $options: 'i' } },
        // Searching 'messages.content' can be inefficient for large embedded arrays without a text index.
        // Consider creating a text index on 'messages.content' for better performance if this is a frequent operation.
        { 'messages.content': { $regex: searchTerm, $options: 'i' } },
        { 'metadata.tags': { $in: [new RegExp(searchTerm, 'i')] } },
      ],
    };

    if (category) {
      query['metadata.category'] = category;
    }

    const conversations = await Conversation.find(
      req ? withTenantFilter(req, query) : query
    )
      .sort({ lastActivity: -1 })
      .limit(limit)
      .lean();

    return conversations;
  } catch (error) {
    logger.error('Error searching conversations:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to search conversations'
    );
  }
};

const getAllSavedConversations = async (
  userId,
  limit = 20,
  page = 1,
  req = null
) => {
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
      .skip((page - 1) * limit);

    const total = await Conversation.countDocuments(
      req ? withTenantFilter(req, query) : query
    );

    return {
      conversations,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  } catch (error) {
    logger.error('Error fetching all saved conversations:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch saved conversations'
    );
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

    // Apply tenant filtering using withTenantPipeline
    const tenantPipeline = req
      ? withTenantPipeline(req, pipeline) // Use the imported withTenantPipeline
      : pipeline;

    const stats = await Conversation.aggregate(tenantPipeline);

    const result = {
      total: 0,
      active: 0,
      archived: 0,
      deleted: 0,
      totalMessages: 0,
    };

    stats.forEach((stat) => {
      result[stat._id] = stat.count;
      result.total += stat.count;
      result.totalMessages += stat.totalMessages;
    });

    return result;
  } catch (error) {
    logger.error('Error fetching conversation stats:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch conversation statistics'
    );
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
const getConversationsByCategory = async (
  userId,
  category,
  options = {},
  req = null
) => {
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch conversations by category'
    );
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
      .select('conversationId title lastActivity messageCount');

    return conversations;
  } catch (error) {
    logger.error('Error fetching recent conversations:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch recent conversations'
    );
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