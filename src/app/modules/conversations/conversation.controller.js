import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { conversationHelpers } from './conversation.helpers.js';
import { conversationService } from './conversation.service.js';

/**
 * Create a new conversation
 */
const createConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { title, initialMessage, metadata, conversationId } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await conversationService.createConversation(
    { userId, title, initialMessage, metadata },
    conversationId
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Conversation created successfully',
    data: result,
  });
});

/**
 * Get user conversations with pagination
 */
const getUserConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const {
    page = 1,
    limit = 20,
    status = 'active',
    sortBy = 'lastActivity',
    sortOrder = -1,
    search = '',
    category = null,
    is_deep_search = null,
  } = req.query;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    sortBy,
    sortOrder: parseInt(sortOrder),
    search,
    category,
    is_deep_search: is_deep_search === 'true' ? true : is_deep_search === 'false' ? false : null,
  };

  const result = await conversationHelpers.getUserConversations(userId, options);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

/**
 * Get a specific conversation by ID
 */
const getConversationById = catchAsync(async (req, res) => {
  let userId = req.user?.userId || req.user?._id;
  const { conversationId, user_id } = req.params;
  if (user_id) {
    userId = user_id; // Use user_id from params if provided
  }
  const result = await conversationHelpers.getConversationById(conversationId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation retrieved successfully',
    data: result,
  });
});

/**
 * Get conversation messages with pagination
 */
const getConversationMessages = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { page = 1, limit = 50, beforeDate } = req.query;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    beforeDate,
  };

  const result = await conversationHelpers.getConversationMessages(
    conversationId,
    userId,
    options
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Messages retrieved successfully',
    data: result,
  });
});

/**
 * Add a message to conversation
 */
const addMessage = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { role, content, metadata } = req.body;

  const result = await conversationService.addMessageToConversation(
    conversationId,
    userId,
    { role, content, metadata }
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Message added successfully',
    data: result,
  });
});

/**
 * Update conversation title
 */
const updateTitle = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { title } = req.body;

  const result = await conversationService.updateConversationTitle(
    conversationId,
    userId,
    title
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation title updated successfully',
    data: result,
  });
});

/**
 * Update conversation metadata
 */
const updateMetadata = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { metadata } = req.body;

  const result = await conversationService.updateConversationMetadata(
    conversationId,
    userId,
    metadata
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation metadata updated successfully',
    data: result,
  });
});

/**
 * Archive a conversation
 */
const archiveConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.archiveConversation(conversationId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation archived successfully',
    data: result,
  });
});

/**
 * Restore an archived conversation
 */
const restoreConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.restoreConversation(conversationId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation restored successfully',
    data: result,
  });
});

/**
 * Delete a conversation (soft delete)
 */
const deleteConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.deleteConversation(conversationId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation deleted successfully',
    data: result,
  });
});

/**
 * Permanently delete a conversation
 */
const permanentlyDeleteConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.permanentlyDeleteConversation(
    conversationId,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation permanently deleted successfully',
    data: result,
  });
});

/**
 * Clear conversation messages
 */
const clearMessages = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.clearConversationMessages(
    conversationId,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation messages cleared successfully',
    data: result,
  });
});

/**
 * Search conversations
 */
const searchConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { q: searchTerm, limit = 10, category } = req.query;

  if (!searchTerm) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Search term is required',
    });
  }

  const result = await conversationHelpers.searchConversations(
    userId,
    searchTerm,
    { limit: parseInt(limit), category }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Search completed successfully',
    data: result,
  });
});

/**
 * Get conversation statistics
 */
const getConversationStats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  const result = await conversationHelpers.getConversationStats(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Statistics retrieved successfully',
    data: result,
  });
});

/**
 * Get conversations by category
 */
const getConversationsByCategory = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { category } = req.params;
  const { limit = 20, sortBy = 'lastActivity', sortOrder = -1 } = req.query;

  const options = {
    limit: parseInt(limit),
    sortBy,
    sortOrder: parseInt(sortOrder),
  };

  const result = await conversationHelpers.getConversationsByCategory(
    userId,
    category,
    options
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

/**
 * Get recent conversations
 */
const getRecentConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { limit = 5 } = req.query;

  const result = await conversationHelpers.getRecentConversations(
    userId,
    parseInt(limit)
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Recent conversations retrieved successfully',
    data: result,
  });
});

/**
 * Bulk archive conversations
 */
const bulkArchiveConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationIds } = req.body;

  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'conversationIds must be a non-empty array',
    });
  }

  const result = await conversationService.bulkArchiveConversations(
    conversationIds,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations archived successfully',
    data: result,
  });
});

/**
 * Bulk delete conversations
 */
const bulkDeleteConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationIds } = req.body;

  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'conversationIds must be a non-empty array',
    });
  }

  const result = await conversationService.bulkDeleteConversations(
    conversationIds,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations deleted successfully',
    data: result,
  });
});

/**
 * Get deep search conversations
 */
const getDeepSearchConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const {
    page = 1,
    limit = 20,
    status = 'active',
    sortBy = 'lastActivity',
    sortOrder = -1,
    search = '',
    category = null,
  } = req.query;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    sortBy,
    sortOrder: parseInt(sortOrder),
    search,
    category,
    is_deep_search: true, // Filter only deep search conversations
  };

  const result = await conversationHelpers.getUserConversations(userId, options);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Deep search conversations retrieved successfully',
    data: result,
  });
});

/**
 * Add tags to conversation
 */
const addTags = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { tags } = req.body;

  const result = await conversationService.addConversationTags(
    conversationId,
    userId,
    tags
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tags added successfully',
    data: result,
  });
});

export const conversationController = {
  createConversation,
  getUserConversations,
  getConversationById,
  getConversationMessages,
  addMessage,
  updateTitle,
  updateMetadata,
  archiveConversation,
  restoreConversation,
  deleteConversation,
  permanentlyDeleteConversation,
  clearMessages,
  searchConversations,
  getConversationStats,
  getConversationsByCategory,
  getRecentConversations,
  getDeepSearchConversations,
  bulkArchiveConversations,
  bulkDeleteConversations,
  addTags,
};
