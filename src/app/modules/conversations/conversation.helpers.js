import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';
import { withTenantFilter, withTenantPipeline } from '../../helpers/tenantQuery.js'; // Added withTenantPipeline

/**
 * Retrieves a single conversation by its ID, ensuring it belongs to the specified user
 * and respects tenant isolation if a request object is provided.
 *
 * @param {string} conversationId - The unique identifier of the conversation.
 * @param {string} userId - The ID of the user attempting to access the conversation. This is mandatory for security.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Object>} A promise that resolves to the conversation object.
 * @throws {ApiError} If the conversation is not found or if an internal error occurs.
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
 * Retrieves a paginated list of conversations for a specific user, with filtering and sorting options.
 *
 * @param {string} userId - The ID of the user whose conversations are to be retrieved.
 * @param {Object} [options={}] - Query options for pagination, filtering, and sorting.
 * @param {number} [options.page=1] - The page number for pagination.
 * @param {number} [options.limit=20] - The maximum number of conversations per page.
 * @param {string} [options.status='active'] - Filter conversations by their status (e.g., 'active', 'archived', 'deleted').
 * @param {string} [options.sortBy='lastActivity'] - The field to sort the conversations by.
 * @param {number} [options.sortOrder=-1] - The sort order (-1 for descending, 1 for ascending).
 * @param {string} [options.search=''] - A search term to filter conversations by title or metadata tags.
 * @param {string} [options.category=null] - Filter conversations by a specific category in metadata.
 * @param {boolean} [options.is_deep_search=null] - Filter conversations by the `is_deep_search` flag.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Object>} A promise that resolves to an object containing the paginated conversations and pagination metadata.
 * @throws {ApiError} If an internal server error occurs during the fetch operation.
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
 * Retrieves paginated messages for a specific conversation, ensuring user access and tenant isolation.
 * Messages can be filtered by a `beforeDate` to fetch older messages.
 *
 * @param {string} conversationId - The unique identifier of the conversation.
 * @param {string} userId - The ID of the user attempting to access the conversation messages.
 * @param {Object} [options={}] - Query options for pagination and filtering.
 * @param {number} [options.page=1] - The page number for pagination.
 * @param {number} [options.limit=50] - The maximum number of messages per page.
 * @param {string} [options.beforeDate=null] - An ISO date string. Only messages with a timestamp older than this date will be returned.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Object>} A promise that resolves to an object containing conversation metadata, paginated messages, and pagination details.
 * @throws {ApiError} If the conversation is not found or if an internal error occurs during message retrieval.
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
 * Searches for conversations belonging to a user based on a search term,
 * filtering by title, message content, or metadata tags.
 *
 * @param {string} userId - The ID of the user whose conversations are to be searched.
 * @param {string} searchTerm - The term to search for within conversation titles, messages, or tags.
 * @param {Object} [options={}] - Query options for limiting results and filtering by category.
 * @param {number} [options.limit=10] - The maximum number of search results to return.
 * @param {string} [options.category=null] - Filter search results by a specific category in metadata.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of matching conversation objects.
 * @throws {ApiError} If an internal server error occurs during the search operation.
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

/**
 * Retrieves a paginated list of all conversations marked as 'saved' for a specific user.
 *
 * @param {string} userId - The ID of the user whose saved conversations are to be retrieved.
 * @param {number} [limit=20] - The maximum number of saved conversations per page.
 * @param {number} [page=1] - The page number for pagination.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Object>} A promise that resolves to an object containing the paginated saved conversations and pagination metadata.
 * @throws {ApiError} If an internal server error occurs during the fetch operation.
 */
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
 * Retrieves statistics about a user's conversations, grouped by status.
 *
 * @param {string} userId - The ID of the user for whom to retrieve conversation statistics.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Object>} A promise that resolves to an object containing conversation counts by status (active, archived, deleted) and total messages.
 * @throws {ApiError} If an internal server error occurs during the aggregation.
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
 * Retrieves a list of conversations for a specific user, filtered by category.
 *
 * @param {string} userId - The ID of the user whose conversations are to be retrieved.
 * @param {string} category - The category to filter conversations by (e.g., 'support', 'sales').
 * @param {Object} [options={}] - Query options for limiting and sorting.
 * @param {number} [options.limit=20] - The maximum number of conversations to return.
 * @param {string} [options.sortBy='lastActivity'] - The field to sort the conversations by.
 * @param {number} [options.sortOrder=-1] - The sort order (-1 for descending, 1 for ascending).
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of conversation objects belonging to the specified category.
 * @throws {ApiError} If an internal server error occurs during the fetch operation.
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
 * Checks if a specific user has access to a given conversation.
 *
 * @param {string} conversationId - The unique identifier of the conversation.
 * @param {string} userId - The ID of the user to check access for.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the user has access, `false` otherwise.
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
 * Retrieves a list of recent active conversations for a specific user.
 *
 * @param {string} userId - The ID of the user whose recent conversations are to be retrieved.
 * @param {number} [limit=5] - The maximum number of recent conversations to return.
 * @param {Object} [req=null] - The Express request object, used to extract tenant information for multi-tenancy.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of recent conversation objects, including ID, title, last activity, and message count.
 * @throws {ApiError} If an internal server error occurs during the fetch operation.
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

/**
 * @typedef {Object} ConversationHelpers
 * @property {function(string, string, Object): Promise<Object>} getConversationById - Retrieves a single conversation by its ID.
 * @property {function(string, Object, Object): Promise<Object>} getUserConversations - Retrieves a paginated list of conversations for a specific user.
 * @property {function(string, string, Object, Object): Promise<Object>} getConversationMessages - Retrieves paginated messages for a specific conversation.
 * @property {function(string, string, Object, Object): Promise<Array<Object>>} searchConversations - Searches for conversations belonging to a user.
 * @property {function(string, number, number, Object): Promise<Object>} getAllSavedConversations - Retrieves a paginated list of all saved conversations for a user.
 * @property {function(string, Object): Promise<Object>} getConversationStats - Retrieves statistics about a user's conversations.
 * @property {function(string, string, Object, Object): Promise<Array<Object>>} getConversationsByCategory - Retrieves conversations for a user filtered by category.
 * @property {function(string, string, Object): Promise<boolean>} hasConversationAccess - Checks if a user has access to a given conversation.
 * @property {function(string, number, Object): Promise<Array<Object>>} getRecentConversations - Retrieves a list of recent active conversations for a user.
 */

/**
 * An object containing helper functions for managing conversations.
 * @type {ConversationHelpers}
 */
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