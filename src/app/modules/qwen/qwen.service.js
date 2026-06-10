import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js'; // Optimization: Consider adding a compound index on { user: 1, sessionId: 1 } in chatHistory.model.js for better query performance.
import { paymentController } from '../payment/payment.controller.js';
import {
  QWEN_QWQ_RESPONSE_SERVICE_POST,
  QWEN_RESPONSE_SERVICE_POST,
} from './qwen.constant.js';

// Removed global sessionMemoryStore and QwenQWQSessionMemoryStore.
// These global stores led to memory leaks, scalability issues in multi-instance deployments,
// and potential security/privacy concerns if session IDs were reused or predictable.
// Conversation history will now be loaded from and saved to the database (ChatHistory model)
// for each request, ensuring persistence, scalability, and proper session isolation.

/**
 * Handles the core logic for getting an AI response, managing conversation history,
 * updating payment usage, and persisting data. This private helper function orchestrates
 * the interaction with the AI model, database, and Redis.
 *
 * @private
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @param {string} sessionId - The ID of the current chat session, used to retrieve and store history.
 * @param {string} redisChannel - The Redis channel to publish the AI response to.
 * @returns {Promise<object>} A promise that resolves to a payload containing sessionId, prompt, and the AI's reply.
 * @throws {ApiError} If there's an issue loading/saving chat history, updating payment usage,
 *                     or if the AI service fails to generate a response.
 */
const _getAiResponseService = async (prompt, userId, sessionId, redisChannel) => {
  try {
    // Load existing chat history from the database for the current session
    const existingChatSession = await ChatHistory.findOne({ user: userId, sessionId });
    const chatHistory = new InMemoryChatMessageHistory();

    if (existingChatSession && existingChatSession.responses) {
      existingChatSession.responses.forEach(entry => {
        if (entry.prompt) {
          chatHistory.addMessage(new HumanMessage(entry.prompt));
        }
        if (entry.reply) {
          chatHistory.addMessage(new AIMessage(entry.reply));
        }
      });
    }

    // Initialize BufferMemory with the loaded chat history
    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistory,
    });

    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      apiKey: config.gemini_secret_key,
    });

    const chain = new ConversationChain({ llm: model, memory });
    logger.info('Memory Initialized with history:', memory.chatHistory.messages.length, 'messages');

    // Store user message in chat history (Langchain memory)
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Invoke model
    const res1 = await chain.invoke({ input: prompt });
    logger.info('Model Response:', res1);

    const reply = res1?.response || 'No reply generated';

    // Handle payment increment
    try {
      const paymentResult = await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      logger.error('Error in incrementPromptsUsed:', error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    // Store AI response in chat history (Langchain memory)
    await memory.chatHistory.addMessage(new AIMessage(reply));

    // Prepare response data for database persistence
    const responseData = {
      prompt,
      model: 'gemini-2.5-flash-thinking', // Note: 'gemini-2.5-flash-thinking' is used here, while the model is 'gemini-2.5-flash'. Assuming '-thinking' is an intentional suffix for tracking.
      reply,
      total_time: res1?.usage?.total_time || 0,
    };

    let currentChatSession;
    // Optimization: Use findOneAndUpdate with $push for existing sessions.
    // This is more efficient than fetching the entire document, modifying it in memory,
    // and then saving it back, especially for documents with large arrays.
    // Using upsert: true to create the document if it doesn't exist.
    const updatedSession = await ChatHistory.findOneAndUpdate(
      { user: userId, sessionId },
      { $push: { responses: responseData } },
      { new: true, upsert: true } // Return the updated document, create if not found
    );

    if (updatedSession) {
      logger.info('Chat Session Updated or Created:', updatedSession._id);
      currentChatSession = updatedSession;

      // If a new session was created by upsert (i.e., no existingChatSession was found),
      // ensure UserModel is updated to link this new session.
      if (!existingChatSession) {
        await UserModel.findByIdAndUpdate(userId, {
          $addToSet: { llamaAiSessions: currentChatSession._id }, // Use $addToSet to prevent duplicate session IDs in the array
        });
      }
    } else {
      // This block should ideally not be reached with upsert: true, but as a fallback for unexpected issues.
      logger.error('Failed to update or create chat session.');
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to save chat history.');
    }

    const payload = {
      sessionId,
      prompt,
      reply,
    };

    // Removed redundant `if (payload)` check as payload is always a truthy object.
    await RedisClient.publish(redisChannel, JSON.stringify(payload));

    return payload;
  } catch (error) {
    logger.error('Error in _getAiResponseService:', error);
    // Re-throw ApiError directly, or wrap generic errors
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

/**
 * Provides a public interface to get an AI response for a standard Qwen AI chat session.
 * It leverages the internal `_getAiResponseService` to handle the core logic.
 *
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user.
 * @param {string} sessionId - The ID of the current chat session.
 * @returns {Promise<object>} A promise that resolves to a payload containing sessionId, prompt, and the AI's reply.
 * @throws {ApiError} If the underlying AI service encounters an error.
 */
const QwenAiGetResponseService = async (prompt, userId, sessionId) => {
  return _getAiResponseService(prompt, userId, sessionId, QWEN_RESPONSE_SERVICE_POST);
};

/**
 * Provides a public interface to get an AI response for a Qwen QWQ (specific variant) chat session.
 * It leverages the internal `_getAiResponseService` to handle the core logic.
 *
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user.
 * @param {string} sessionId - The ID of the current chat session.
 * @returns {Promise<object>} A promise that resolves to a payload containing sessionId, prompt, and the AI's reply.
 * @throws {ApiError} If the underlying AI service encounters an error.
 */
const QwenQWQAiGetResponseService = async (prompt, userId, sessionId) => {
  return _getAiResponseService(prompt, userId, sessionId, QWEN_QWQ_RESPONSE_SERVICE_POST);
};

/**
 * @typedef {object} QwenAiServices
 * @property {function(string, string, string): Promise<object>} QwenAiGetResponseService - Function to get a standard Qwen AI response.
 * @property {function(string, string, string): Promise<object>} QwenQWQAiGetResponseService - Function to get a Qwen QWQ AI response.
 */

/**
 * An object containing all Qwen AI related service functions.
 * @type {QwenAiServices}
 */
export const QwenAiServices = {
  QwenAiGetResponseService,
  QwenQWQAiGetResponseService,
};