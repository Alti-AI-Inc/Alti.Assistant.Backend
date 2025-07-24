import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';
import { conversationHelpers } from './conversation.helpers.js';

/**
 * Create a new conversation
 * @param {Object} conversationData
 * @returns {Promise<Object>}
 */
const createConversation = async (conversationData, conversationId) => {
  try {
    const {
      userId,
      title = 'New Conversation',
      initialMessage = null,
      metadata = {},
      is_deep_search = false,
    } = conversationData;

    // Generate unique conversation ID

    const conversation = new Conversation({
      conversationId,
      userId,
      title,
      metadata,
      messages: [],
      status: 'active',
      is_deep_search,
    });

    // Add initial message if provided
    if (initialMessage) {
      conversation.addMessage(
        initialMessage.role || 'user',
        initialMessage.content,
        initialMessage.metadata || {}
      );
    }

    await conversation.save();

    logger.info(`Conversation created: ${conversationId} for user: ${userId}`);

    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      messageCount: conversation.messageCount,
    };
  } catch (error) {
    logger.error('Error creating conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create conversation');
  }
};

/**
 * Add a message to an existing conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {Object} messageData
 * @returns {Promise<Object>}
 */
const addMessageToConversation = async (conversationId, userId, messageData) => {
  try {
    const { role, content, metadata = {} } = messageData;

    if (!role || !content) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Message role and content are required');
    }

    const conversation = await Conversation.findByConversationId(conversationId, userId);
    
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Add the message
    conversation.addMessage(role, content, metadata);
    await conversation.save();

    // Return the newly added message
    const newMessage = conversation.messages[conversation.messages.length - 1];

    logger.info(`Message added to conversation: ${conversationId}`);

    return {
      messageId: newMessage._id,
      role: newMessage.role,
      content: newMessage.content,
      timestamp: newMessage.timestamp,
      metadata: newMessage.metadata,
    };
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw error;
  }
};

/**
 * Update conversation title
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} title
 * @returns {Promise<Object>}
 */
const updateConversationTitle = async (conversationId, userId, title) => {
  try {
    if (!title || title.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Title cannot be empty');
    }

    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId },
      { title: title.trim(), lastActivity: new Date() },
      { new: true, runValidators: true }
    ).select('conversationId title lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    logger.info(`Conversation title updated: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error updating conversation title:', error);
    throw error;
  }
};

/**
 * Update conversation metadata
 * @param {string} conversationId
 * @param {string} userId
 * @param {Object} metadata
 * @returns {Promise<Object>}
 */
const updateConversationMetadata = async (conversationId, userId, metadata) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId },
      { 
        $set: { 
          metadata: { ...metadata },
          lastActivity: new Date()
        }
      },
      { new: true, runValidators: true }
    ).select('conversationId metadata lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    logger.info(`Conversation metadata updated: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error updating conversation metadata:', error);
    throw error;
  }
};

/**
 * Archive a conversation
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const archiveConversation = async (conversationId, userId) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId, status: 'active' },
      { status: 'archived', lastActivity: new Date() },
      { new: true }
    ).select('conversationId status lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Active conversation not found');
    }

    logger.info(`Conversation archived: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error archiving conversation:', error);
    throw error;
  }
};

/**
 * Restore an archived conversation
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const restoreConversation = async (conversationId, userId) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId, status: 'archived' },
      { status: 'active', lastActivity: new Date() },
      { new: true }
    ).select('conversationId status lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Archived conversation not found');
    }

    logger.info(`Conversation restored: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error restoring conversation:', error);
    throw error;
  }
};

/**
 * Delete a conversation (soft delete)
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const deleteConversation = async (conversationId, userId) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId },
      { status: 'deleted', lastActivity: new Date() },
      { new: true }
    ).select('conversationId status');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    logger.info(`Conversation deleted: ${conversationId}`);

    return { message: 'Conversation deleted successfully' };
  } catch (error) {
    logger.error('Error deleting conversation:', error);
    throw error;
  }
};

/**
 * Permanently delete a conversation
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const permanentlyDeleteConversation = async (conversationId, userId) => {
  try {
    const result = await Conversation.deleteOne({ conversationId, userId });

    if (result.deletedCount === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    logger.info(`Conversation permanently deleted: ${conversationId}`);

    return { message: 'Conversation permanently deleted' };
  } catch (error) {
    logger.error('Error permanently deleting conversation:', error);
    throw error;
  }
};

/**
 * Clear all messages from a conversation
 * @param {string} conversationId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const clearConversationMessages = async (conversationId, userId) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId },
      { 
        messages: [],
        messageCount: 0,
        lastActivity: new Date()
      },
      { new: true }
    ).select('conversationId messageCount lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    logger.info(`Conversation messages cleared: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error clearing conversation messages:', error);
    throw error;
  }
};

/**
 * Bulk archive conversations
 * @param {Array<string>} conversationIds
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const bulkArchiveConversations = async (conversationIds, userId) => {
  try {
    const result = await Conversation.updateMany(
      { 
        conversationId: { $in: conversationIds },
        userId,
        status: 'active'
      },
      { 
        status: 'archived',
        lastActivity: new Date()
      }
    );

    logger.info(`Bulk archived ${result.modifiedCount} conversations for user: ${userId}`);

    return {
      message: `${result.modifiedCount} conversations archived successfully`,
      modifiedCount: result.modifiedCount,
    };
  } catch (error) {
    logger.error('Error bulk archiving conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to archive conversations');
  }
};

/**
 * Bulk delete conversations
 * @param {Array<string>} conversationIds
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const bulkDeleteConversations = async (conversationIds, userId) => {
  try {
    const result = await Conversation.updateMany(
      { 
        conversationId: { $in: conversationIds },
        userId
      },
      { 
        status: 'deleted',
        lastActivity: new Date()
      }
    );

    logger.info(`Bulk deleted ${result.modifiedCount} conversations for user: ${userId}`);

    return {
      message: `${result.modifiedCount} conversations deleted successfully`,
      modifiedCount: result.modifiedCount,
    };
  } catch (error) {
    logger.error('Error bulk deleting conversations:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete conversations');
  }
};

/**
 * Add tags to a conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {Array<string>} tags
 * @returns {Promise<Object>}
 */
const addConversationTags = async (conversationId, userId, tags) => {
  try {
    if (!Array.isArray(tags) || tags.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tags must be a non-empty array');
    }

    const conversation = await Conversation.findOneAndUpdate(
      { conversationId, userId },
      { 
        $addToSet: { 'metadata.tags': { $each: tags } },
        lastActivity: new Date()
      },
      { new: true }
    ).select('conversationId metadata.tags lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    logger.info(`Tags added to conversation: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error adding tags to conversation:', error);
    throw error;
  }
};

export const conversationService = {
  createConversation,
  addMessageToConversation,
  updateConversationTitle,
  updateConversationMetadata,
  archiveConversation,
  restoreConversation,
  deleteConversation,
  permanentlyDeleteConversation,
  clearConversationMessages,
  bulkArchiveConversations,
  bulkDeleteConversations,
  addConversationTags,
};
