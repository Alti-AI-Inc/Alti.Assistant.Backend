import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';
import ChatShare from './chatShare.model.js';
import { conversationHelpers } from './conversation.helpers.js';
import mongoose from 'mongoose';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

/**
 * Create a new conversation
 * @param {Object} conversationData
 * @param {string} conversationId
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const createConversation = async (conversationData, conversationId, req = null) => {
  try {
    const {
      userId,
      title = 'New Conversation',
      initialMessage = null,
      metadata = {},
      is_deep_search = false,
    } = conversationData;
    console.log('Creating conversation with data:', conversationData);

    // Generate unique conversation ID

    const conversationPayload = {
      conversationId,
      userId,
      title,
      metadata,
      messages: [],
      status: 'active',
      is_deep_search,
    };

    const conversation = new Conversation(
      req ? withTenantContext(req, conversationPayload) : conversationPayload
    );

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const addMessageToConversation = async (conversationId, userId, messageData, req = null) => {
  try {
    const { role, content, metadata = {} } = messageData;

    if (!role || !content) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Message role and content are required');
    }

    console.log(`Adding message to conversation ${conversationId} for user ${userId}:`, { role, content, metadata });


    const query = { conversationId, userId };
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, query) : query
    );

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const updateConversationTitle = async (conversationId, userId, title, req = null) => {
  try {
    if (!title || title.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Title cannot be empty');
    }

    const query = { conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const updateConversationMetadata = async (conversationId, userId, metadata, req = null) => {
  try {
    console.log(`Updating metadata for conversation ${conversationId} for user ${userId}:`, metadata);
    const query = { conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      {
        $set: {
          metadata: { ...metadata },
          lastActivity: new Date()
        }
      },
      { new: true, runValidators: true }
    ).select('conversationId metadata lastActivity');
    console.log('Updated conversation metadata:', conversation?.metadata);
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

const updadtePlanMetadata = async (conversationId, userId, planMetadata, req = null) => {
  try {
    console.log(`Updating plan metadata for conversation ${conversationId} for user ${userId}:`, planMetadata);
    const query = { conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      {
        $set: {
          plan_metadata: { ...planMetadata },
          lastActivity: new Date()
        }
      },
      { new: true, runValidators: true }
    ).select('conversationId plan_metadata lastActivity');
    console.log('Updated plan metadata:', conversation?.plan_metadata);
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    logger.info(`Conversation plan metadata updated: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error updating conversation plan metadata:', error);
    throw error;
  }
};

const updatePresentationMetadata = async (conversationId, userId, presentationMetadata, req = null) => {
  try {
    console.log(`Updating presentation metadata for conversation ${conversationId} for user ${userId}:`, presentationMetadata);
    const query = { conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      {
        $set: {
          presentation_metadata: { ...presentationMetadata },
          lastActivity: new Date()
        }
      },
      { new: true, runValidators: true }
    ).select('conversationId presentation_metadata lastActivity');
    console.log('Updated presentation metadata:', conversation?.presentation_metadata);
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    logger.info(`Conversation presentation metadata updated: ${conversationId}`);

    return conversation;
  } catch (error) {
    logger.error('Error updating conversation presentation metadata:', error);
    throw error;
  }
};

/**
 * Archive a conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const archiveConversation = async (conversationId, userId, req = null) => {
  try {
    const query = { conversationId, userId, status: 'active' };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const restoreConversation = async (conversationId, userId, req = null) => {
  try {
    const query = { conversationId, userId, status: 'archived' };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const deleteConversation = async (conversationId, userId, req = null) => {
  try {
    const query = { _id: conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
      { status: 'deleted', lastActivity: new Date() },
      { new: true }
    ).select('conversationId status');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    const deleteQuery = { _id: conversationId, userId };
    await Conversation.deleteOne(
      req ? withTenantFilter(req, deleteQuery) : deleteQuery
    );
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<void>}
 */
const permanentlyDeleteConversation = async (conversationId, userId, req = null) => {
  try {
    const query = { conversationId, userId };
    const result = await Conversation.deleteOne(
      req ? withTenantFilter(req, query) : query
    );

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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const clearConversationMessages = async (conversationId, userId, req = null) => {
  try {
    const query = { conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const bulkArchiveConversations = async (conversationIds, userId, req = null) => {
  try {
    const query = {
      conversationId: { $in: conversationIds },
      userId,
      status: 'active'
    };
    const result = await Conversation.updateMany(
      req ? withTenantFilter(req, query) : query,
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const bulkDeleteConversations = async (conversationIds, userId, req = null) => {
  try {
    const query = {
      conversationId: { $in: conversationIds },
      userId
    };
    const result = await Conversation.updateMany(
      req ? withTenantFilter(req, query) : query,
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
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const addConversationTags = async (conversationId, userId, tags, req = null) => {
  try {
    if (!Array.isArray(tags) || tags.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Tags must be a non-empty array');
    }

    const query = { conversationId, userId };
    const conversation = await Conversation.findOneAndUpdate(
      req ? withTenantFilter(req, query) : query,
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

/**
 * Share a chat conversation
 * @param {Object} shareData
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const shareChatConversation = async (shareData, req = null) => {
  try {
    const { conversationId, userId, shareType, expiresAt, allowComments } = shareData;
    console.log(`Sharing conversation ${conversationId} for user ${userId}:`, { shareType, expiresAt, allowComments });

    // Check if conversation exists and belongs to user
    const query = { _id: new mongoose.Types.ObjectId(conversationId), userId: new mongoose.Types.ObjectId(userId) };
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, query) : query
    );
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Check if conversation is already shared
    const shareQuery = {
      conversationId,
      userId,
      isActive: true
    };
    let existingShare = await ChatShare.findOne(
      req ? withTenantFilter(req, shareQuery) : shareQuery
    );

    if (existingShare) {
      // Update existing share
      existingShare.shareType = shareType;
      existingShare.expiresAt = expiresAt;
      existingShare.allowComments = allowComments;
      await existingShare.save();

      logger.info(`Chat conversation share updated: ${conversationId} by user: ${userId}`);

      return {
        shareId: existingShare.shareId,
        shareUrl: `/chat/shared/${existingShare.shareId}`,
        shareType: existingShare.shareType,
        expiresAt: existingShare.expiresAt,
        allowComments: existingShare.allowComments,
        isActive: existingShare.isActive,
      };
    }

    // Create new share
    const shareData = {
      conversationId,
      userId,
      shareType,
      expiresAt,
      allowComments,
    };
    const chatShare = new ChatShare(
      req ? withTenantContext(req, shareData) : shareData
    );

    await chatShare.save();

    logger.info(`Chat conversation shared: ${conversationId} by user: ${userId}`);

    return {
      shareId: chatShare.shareId,
      shareUrl: `/chat/shared/${chatShare.shareId}`,
      shareType: chatShare.shareType,
      expiresAt: chatShare.expiresAt,
      allowComments: chatShare.allowComments,
      isActive: chatShare.isActive,
    };
  } catch (error) {
    logger.error('Error sharing chat conversation:', error);
    throw error;
  }
};

/**
 * Get shared chat conversation
 * @param {string} shareId
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getSharedChatConversation = async (shareId, req = null) => {
  try {
    const shareQuery = { shareId };
    const chatShare = await ChatShare.findOne(
      req ? withTenantFilter(req, shareQuery) : shareQuery
    );

    if (!chatShare) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Shared chat not found or expired');
    }

    if (!chatShare.isAccessible()) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Shared chat is no longer accessible');
    }

    // Get the conversation details
    const convQuery = {
      _id: chatShare.conversationId
    };
    const conversation = await Conversation.findOne(
      req ? withTenantFilter(req, convQuery) : convQuery
    ).populate('userId', 'username email');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Increment view count
    await chatShare.incrementViewCount();

    logger.info(`Shared chat accessed: ${shareId}`);

    return {
      shareId: chatShare.shareId,
      conversation: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        messages: conversation.messages,
        messageCount: conversation.messageCount,
        lastActivity: conversation.lastActivity,
        createdAt: conversation.createdAt,
        metadata: conversation.metadata,
      },
      owner: {
        username: conversation.userId.username || 'Anonymous',
      },
      shareSettings: {
        shareType: chatShare.shareType,
        allowComments: chatShare.allowComments,
        viewCount: chatShare.viewCount,
        sharedAt: chatShare.createdAt,
        expiresAt: chatShare.expiresAt,
      },
    };
  } catch (error) {
    logger.error('Error getting shared chat conversation:', error);
    throw error;
  }
};

const renameChatConversation = async (conversationId, userId, newTitle, req = null) => {
  try {
    if (!newTitle || newTitle.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Title cannot be empty');
    }
    const query = { conversationId, userId };
    const conversation = await Conversation.updateOne(
      req ? withTenantFilter(req, query) : query,
      { title: newTitle.trim(), lastActivity: new Date() }
    ).select('conversationId title lastActivity');
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    logger.info(`Conversation renamed: ${conversationId}`);
    return conversation;
  } catch (error) {
    logger.error('Error renaming conversation:', error);
    throw error;
  }
};

const saveChatConversation = async (conversationId, userId, is_saved, req = null) => {
  try {
    const query = { conversationId, userId };
    const conversation = await Conversation.updateOne(
      req ? withTenantFilter(req, query) : query,
      { is_saved, lastActivity: new Date() }
    ).select('conversationId is_saved lastActivity');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    logger.info(`Conversation saved: ${conversationId}`);
    return conversation;
  } catch (error) {
    logger.error('Error saving conversation:', error);
    throw error;
  }
};

/**
 * Update chat share settings
 * @param {Object} updateData
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const updateChatShareSettings = async (updateData, req = null) => {
  try {
    const { conversationId, userId, shareType, expiresAt, allowComments, isActive } = updateData;

    // Find the chat share
    const query = {
      conversationId,
      userId
    };
    const chatShare = await ChatShare.findOne(
      req ? withTenantFilter(req, query) : query
    );

    if (!chatShare) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chat share not found');
    }

    // Update fields if provided
    if (shareType !== undefined) chatShare.shareType = shareType;
    if (expiresAt !== undefined) chatShare.expiresAt = expiresAt;
    if (allowComments !== undefined) chatShare.allowComments = allowComments;
    if (isActive !== undefined) chatShare.isActive = isActive;

    await chatShare.save();

    logger.info(`Chat share settings updated: ${conversationId} by user: ${userId}`);

    return {
      shareId: chatShare.shareId,
      shareUrl: `/chat/shared/${chatShare.shareId}`,
      shareType: chatShare.shareType,
      expiresAt: chatShare.expiresAt,
      allowComments: chatShare.allowComments,
      isActive: chatShare.isActive,
      updatedAt: chatShare.updatedAt,
    };
  } catch (error) {
    logger.error('Error updating chat share settings:', error);
    throw error;
  }
};

/**
 * Get user's shared chats
 * @param {Object} queryData
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const getUserSharedChats = async (queryData, req = null) => {
  try {
    const { userId, page, limit, status } = queryData;

    const chatShares = await ChatShare.findUserShares(userId, { page, limit, status }, req);

    const countQuery = {
      userId,
      ...(status === 'active' && {
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }),
      ...(status === 'expired' && { expiresAt: { $lte: new Date() } }),
      ...(status === 'revoked' && { isActive: false }),
    };
    const totalShares = await ChatShare.countDocuments(
      req ? withTenantFilter(req, countQuery) : countQuery
    );

    const totalPages = Math.ceil(totalShares / limit);

    logger.info(`Retrieved ${chatShares.length} shared chats for user: ${userId}`);

    return {
      shares: chatShares.map(share => ({
        shareId: share.shareId,
        shareUrl: `/chat/shared/${share.shareId}`,
        conversation: {
          conversationId: share.conversationId.conversationId,
          title: share.conversationId.title,
          messageCount: share.conversationId.messageCount,
          lastActivity: share.conversationId.lastActivity,
        },
        shareType: share.shareType,
        allowComments: share.allowComments,
        viewCount: share.viewCount,
        isActive: share.isActive,
        expiresAt: share.expiresAt,
        sharedAt: share.createdAt,
        lastViewedAt: share.lastViewedAt,
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: totalShares,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  } catch (error) {
    logger.error('Error getting user shared chats:', error);
    throw error;
  }
};

/**
 * Revoke chat share
 * @param {Object} revokeData
 * @param {Object} req - Request object for tenant context
 * @returns {Promise<Object>}
 */
const revokeChatShare = async (revokeData, req = null) => {
  try {
    const { conversationId, userId } = revokeData;

    const query = {
      conversationId,
      userId
    };
    const chatShare = await ChatShare.findOne(
      req ? withTenantFilter(req, query) : query
    );

    if (!chatShare) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Chat share not found');
    }

    chatShare.isActive = false;
    await chatShare.save();

    logger.info(`Chat share revoked: ${conversationId} by user: ${userId}`);

    return {
      shareId: chatShare.shareId,
      message: 'Chat share has been revoked successfully',
      revokedAt: new Date(),
    };
  } catch (error) {
    logger.error('Error revoking chat share:', error);
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
  // Share chat methods
  shareChatConversation,
  getSharedChatConversation,
  updateChatShareSettings,
  getUserSharedChats,
  revokeChatShare,
  renameChatConversation,
  saveChatConversation,
  updatePresentationMetadata,
  updadtePlanMetadata,
};
