import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import Conversation from './conversation.model.js';
import ChatShare from './chatShare.model.js';
import { conversationHelpers } from './conversation.helpers.js';
import mongoose from 'mongoose';

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
    console.log('Creating conversation with data:', conversationData);

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

    console.log(`Adding message to conversation ${conversationId} for user ${userId}:`, { role, content, metadata });


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
      { _id: conversationId, userId },
      { status: 'deleted', lastActivity: new Date() },
      { new: true }
    ).select('conversationId status');

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }
    await Conversation.deleteOne({ _id: conversationId, userId });
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

/**
 * Share a chat conversation
 * @param {Object} shareData
 * @returns {Promise<Object>}
 */
const shareChatConversation = async (shareData) => {
  try {
    const { conversationId, userId, shareType, expiresAt, allowComments } = shareData;
    console.log(`Sharing conversation ${conversationId} for user ${userId}:`, { shareType, expiresAt, allowComments });

    // Check if conversation exists and belongs to user
    const conversation = await Conversation.findOne({ _id: new mongoose.Types.ObjectId(conversationId), userId: new mongoose.Types.ObjectId(userId) });
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // Check if conversation is already shared
    let existingShare = await ChatShare.findOne({
      conversationId,
      userId,
      isActive: true
    });

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
    const chatShare = new ChatShare({
      conversationId,
      userId,
      shareType,
      expiresAt,
      allowComments,
    });

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
 * @returns {Promise<Object>}
 */
const getSharedChatConversation = async (shareId) => {
  try {
    const chatShare = await ChatShare.findOne({ shareId });

    if (!chatShare) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Shared chat not found or expired');
    }

    if (!chatShare.isAccessible()) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Shared chat is no longer accessible');
    }

    // Get the conversation details
    const conversation = await Conversation.findOne({
      _id: chatShare.conversationId
    }).populate('userId', 'username email');

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

const renameChatConversation = async (conversationId, userId, newTitle) => {
  try {
    if (!newTitle || newTitle.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Title cannot be empty');
    }
    const conversation = await Conversation.updateOne(
      { conversationId, userId },
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

const saveChatConversation = async (conversationId, userId, is_saved) => {
  try {
    const conversation = await Conversation.updateOne(
      { conversationId, userId },
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
 * @returns {Promise<Object>}
 */
const updateChatShareSettings = async (updateData) => {
  try {
    const { conversationId, userId, shareType, expiresAt, allowComments, isActive } = updateData;

    // Find the chat share
    const chatShare = await ChatShare.findOne({
      conversationId,
      userId
    });

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
 * @returns {Promise<Object>}
 */
const getUserSharedChats = async (queryData) => {
  try {
    const { userId, page, limit, status } = queryData;

    const chatShares = await ChatShare.findUserShares(userId, { page, limit, status });

    const totalShares = await ChatShare.countDocuments({
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
    });

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
 * @returns {Promise<Object>}
 */
const revokeChatShare = async (revokeData) => {
  try {
    const { conversationId, userId } = revokeData;

    const chatShare = await ChatShare.findOne({
      conversationId,
      userId
    });

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
};
