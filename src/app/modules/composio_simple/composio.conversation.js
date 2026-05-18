import Conversation from '../conversations/conversation.model.js';
import { conversationSummaryService } from '../conversations/conversationSummary.service.js';

/**
 * Simple conversation management for Composio
 */

/**
 * Generate a unique conversation ID
 */
export const generateConversationId = () => {
  return `composio-simple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create or get conversation
 */
export const getOrCreateConversation = async (
  userId,
  conversationId,
  initialMessage
) => {
  if (conversationId) {
    // Try to get existing conversation
    const existing = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (existing) return existing;
  }

  // Create new conversation
  const newConversationId = generateConversationId();
  const conversation = new Conversation({
    conversationId: newConversationId,
    userId: userId,
    title:
      initialMessage.length > 50
        ? `${initialMessage.substring(0, 50)}...`
        : initialMessage,
    messages: [],
    metadata: {
      category: 'composio_simple',
      version: '1.0',
    },
    status: 'active',
  });

  await conversation.save();
  return conversation;
};

/**
 * Get recent messages (last N messages)
 */
export const getRecentMessages = async (conversationId, userId, limit = 5) => {
  try {
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (!conversation || !conversation.messages) return [];

    // Return last N messages in chronological order
    const recentMessages = conversation.messages.slice(-limit);

    return recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  } catch (error) {
    console.error('Error getting recent messages:', error);
    return [];
  }
};

/**
 * Save message to conversation
 */
export const saveMessage = async (
  conversationId,
  userId,
  role,
  content,
  metadata = {}
) => {
  try {
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    conversation.messages.push({
      role: role,
      content: content,
      timestamp: new Date(),
      metadata: metadata,
    });

    conversation.lastActivity = new Date();
    conversation.messageCount = conversation.messages.length;

    await conversation.save();

    // Check if summarization is needed (async, don't wait)
    conversationSummaryService
      .checkAndSummarizeIfNeeded(conversationId, userId)
      .catch((err) => {
        console.error('Error in background summarization:', err);
      });

    return conversation;
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
};

/**
 * Get user's conversations
 */
export const getUserConversations = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'lastActivity',
    sortOrder = -1,
  } = options;

  const skip = (page - 1) * limit;

  const conversations = await Conversation.find({
    userId: userId,
    'metadata.category': 'composio_simple',
  })
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Conversation.countDocuments({
    userId: userId,
    'metadata.category': 'composio_simple',
  });

  return {
    conversations,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get conversation with summary context
 */
export const getConversationWithContext = async (conversationId, userId) => {
  return conversationSummaryService.getConversationContext(
    conversationId,
    userId
  );
};

export const conversationService = {
  generateConversationId,
  getOrCreateConversation,
  getRecentMessages,
  saveMessage,
  getUserConversations,
  getConversationWithContext,
};
