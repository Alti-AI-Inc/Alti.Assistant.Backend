/**
 * @file This module provides simple conversation management functionalities specifically tailored for Composio interactions.
 * It handles creating, retrieving, updating, and listing conversations, as well as managing individual messages within them.
 * It integrates with a Conversation model and a conversation summary service.
 */

import xss from 'xss'; // Security: Import a library to sanitize user input and prevent XSS attacks.
import Conversation from '../conversations/conversation.model.js';
import { conversationSummaryService } from '../conversations/conversationSummary.service.js';

/**
 * Generates a unique identifier for a new Composio simple conversation.
 * The ID is a combination of a prefix, current timestamp, and a random string.
 *
 * @returns {string} A unique conversation ID string, e.g., `composio-simple-1678886400000-abc12defg`.
 */
export const generateConversationId = () => {
  return `composio-simple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Retrieves an existing conversation by its ID and user ID, or creates a new one if not found.
 * If a `conversationId` is provided and an existing conversation is found, it is returned.
 * Otherwise, a new conversation is initialized with a generated ID, the provided user ID,
 * a title derived from the initial message, and default metadata.
 *
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} [conversationId] - Optional. The ID of an existing conversation to retrieve. If not provided, a new conversation is created.
 * @param {string} initialMessage - The first message in the conversation, used to generate a title for new conversations.
 * @returns {Promise<Conversation>} A promise that resolves to the existing or newly created conversation document.
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

  // Security: Sanitize the initial message to prevent Stored XSS when it's used as the title.
  const sanitizedInitialMessage = xss(initialMessage || '');

  // Create new conversation
  const newConversationId = generateConversationId();
  const conversation = new Conversation({
    conversationId: newConversationId,
    userId: userId,
    title:
      sanitizedInitialMessage.length > 50
        ? `${sanitizedInitialMessage.substring(0, 50)}...`
        : sanitizedInitialMessage,
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
 * Retrieves a specified number of the most recent messages from a conversation.
 * Messages are returned in chronological order (oldest to newest among the recent ones).
 *
 * @param {string} conversationId - The ID of the conversation from which to retrieve messages.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {number} [limit=5] - The maximum number of recent messages to retrieve. Defaults to 5.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of recent message objects.
 *   Each object contains `role`, `content`, and `timestamp`. Returns an empty array if the conversation
 *   is not found, has no messages, or an error occurs.
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The text content of the message.
 * @property {Date} timestamp - The timestamp when the message was sent.
 */
export const getRecentMessages = async (conversationId, userId, limit = 5) => {
  try {
    // Security: Ensure limit is a positive integer to prevent potential issues with Array.slice.
    const safeLimit = Math.max(1, parseInt(limit, 10) || 5);

    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    );
    if (!conversation || !conversation.messages) return [];

    // Return last N messages in chronological order
    const recentMessages = conversation.messages.slice(-safeLimit);

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
 * Saves a new message to an existing conversation.
 * Updates the conversation's `lastActivity` and `messageCount`.
 * Asynchronously triggers a summarization check for the conversation after saving the message.
 *
 * @param {string} conversationId - The ID of the conversation to which the message will be added.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @param {string} content - The text content of the message.
 * @param {Object} [metadata={}] - Optional. Additional metadata to store with the message.
 * @returns {Promise<Conversation>} A promise that resolves to the updated conversation document.
 * @throws {Error} If the conversation is not found for the given `conversationId` and `userId`.
 * @throws {Error} For any other database or internal error during message saving.
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

    // Security: Sanitize user-provided content to prevent Stored XSS attacks.
    // Also sanitize role to prevent unexpected values, though it should ideally be validated against an enum.
    // Note: If metadata can contain user input, it should also be sanitized recursively.
    conversation.messages.push({
      role: xss(role),
      content: xss(content),
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
 * Retrieves a paginated list of conversations for a specific user, filtered by the 'composio_simple' category.
 * Conversations can be sorted by a specified field and order.
 *
 * @param {string} userId - The ID of the user whose conversations are to be retrieved.
 * @param {Object} [options={}] - Optional. Pagination and sorting options.
 * @param {number} [options.page=1] - The page number for pagination.
 * @param {number} [options.limit=20] - The maximum number of conversations per page.
 * @param {string} [options.sortBy='lastActivity'] - The field by which to sort the conversations (e.g., 'lastActivity', 'title').
 * @param {number} [options.sortOrder=-1] - The sort order: 1 for ascending, -1 for descending.
 * @returns {Promise<Object>} A promise that resolves to an object containing the list of conversations and pagination details.
 * @property {Array<Conversation>} conversations - An array of conversation documents.
 * @property {Object} pagination - Pagination details.
 * @property {number} pagination.page - The current page number.
 * @property {number} pagination.limit - The limit of conversations per page.
 * @property {number} pagination.total - The total number of conversations matching the criteria.
 * @property {number} pagination.pages - The total number of pages.
 */
export const getUserConversations = async (userId, options = {}) => {
  // Security: Sanitize and validate pagination and sorting options to prevent injection and ensure type safety.
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.max(1, parseInt(options.limit, 10) || 20);
  const sortBy = options.sortBy || 'lastActivity';
  const parsedSortOrder = parseInt(options.sortOrder, 10);
  const sortOrder = [1, -1].includes(parsedSortOrder) ? parsedSortOrder : -1;

  // Whitelist allowed sort fields to prevent potential injection or performance issues
  // If an invalid sortBy field is provided, it defaults to 'lastActivity'.
  const allowedSortFields = ['lastActivity', 'title', 'createdAt', 'updatedAt'];
  const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'lastActivity';

  const skip = (page - 1) * limit;

  const conversations = await Conversation.find({
    userId: userId,
    'metadata.category': 'composio_simple',
  })
    .sort({ [finalSortBy]: sortOrder }) // Use the validated sort field
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
 * Retrieves a conversation along with its summary context.
 * This function delegates to the `conversationSummaryService` to fetch the context.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @returns {Promise<Object|null>} A promise that resolves to an object containing the conversation and its summary context,
 *   or `null` if the conversation is not found or context cannot be generated.
 */
export const getConversationWithContext = async (conversationId, userId) => {
  return conversationSummaryService.getConversationContext(
    conversationId,
    userId
  );
};

/**
 * An object consolidating all conversation management functions for easy access.
 * This service object provides a unified interface for interacting with Composio simple conversations.
 * @namespace conversationService
 * @property {function(): string} generateConversationId - Generates a unique conversation ID.
 * @property {function(string, string, string): Promise<Conversation>} getOrCreateConversation - Gets or creates a conversation.
 * @property {function(string, string, number): Promise<Array<Object>>} getRecentMessages - Gets recent messages from a conversation.
 * @property {function(string, string, string, string, Object): Promise<Conversation>} saveMessage - Saves a message to a conversation.
 * @property {function(string, Object): Promise<Object>} getUserConversations - Gets a paginated list of user's conversations.
 * @property {function(string, string): Promise<Object|null>} getConversationWithContext - Gets a conversation with its summary context.
 */
export const conversationService = {
  generateConversationId,
  getOrCreateConversation,
  getRecentMessages,
  saveMessage,
  getUserConversations,
  getConversationWithContext,
};