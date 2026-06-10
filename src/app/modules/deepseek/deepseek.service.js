import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { GoogleGenerativeAI } from '@google/generative-ai';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';
// Fix: Corrected typo in filename from 'constatn' to 'constant' and renamed constant to reflect Gemini usage.
import { GEMINI_RESPONSE_SERVICE_POST } from './deepseek.constant.js';
import { RedisClient } from '../../../shared/redis.js';
import config from '../../../../config/index.js';

/**
 * Initializes the Google Generative AI client with the API key from configuration or environment variables.
 * @type {GoogleGenerativeAI}
 */
const client = new GoogleGenerativeAI(config.gemini_secret_key || process.env.GEMINI_API_KEY);

/**
 * A store for managing chat session memories.
 * Each key represents a sessionId, and its value is a BufferMemory instance.
 * This store is in-memory and will be reset on application restart.
 * For persistent memory across restarts, the BufferMemory should be initialized from the database.
 * @type {Object.<string, BufferMemory>}
 */
const sessionMemoryStore = {};

/**
 * Processes a user prompt using the Google Generative AI (Gemini-2.5-flash model),
 * manages chat history, updates user prompt usage, and stores the conversation.
 * It also publishes the response to a Redis channel.
 *
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user making the request.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} A promise that resolves to an object
 *   containing the original prompt, session ID, and the AI's reply.
 * @throws {ApiError} If there's an error during AI service interaction,
 *   prompt usage increment, or database operations.
 */
// Fix: Renamed service function to reflect Gemini usage instead of Deepseek, as Google Generative AI is used.
const geminiResponseService = async (prompt, userId, sessionId) => {
  let memory = sessionMemoryStore[sessionId];

  if (!memory) {
    // Fix: Initialize BufferMemory with existing chat history from the database if available.
    // This ensures continuity of conversation context across application restarts.
    const existingChatSession = await ChatHistory.findOne({ user: userId, sessionId });
    const chatHistory = new InMemoryChatMessageHistory();

    if (existingChatSession && existingChatSession.responses.length > 0) {
      for (const response of existingChatSession.responses) {
        chatHistory.addMessage(new HumanMessage(response.prompt));
        chatHistory.addMessage(new AIMessage(response.reply));
      }
    }

    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistory,
    });
    sessionMemoryStore[sessionId] = memory;
  }

  try {
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    const startTime = Date.now(); // Record start time

    // Call Google Generative AI to generate a response using the gemini-2.5-flash model
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Fix: Pass the entire chat history from BufferMemory to the model for conversational context.
    // The original implementation only passed the latest `prompt`, causing the AI to lose context.
    const historyMessages = (await memory.chatHistory.getMessages()).map(msg => {
      if (msg instanceof HumanMessage) return { role: 'user', parts: [{ text: msg.content }] };
      if (msg instanceof AIMessage) return { role: 'model', parts: [{ text: msg.content }] };
      return null;
    }).filter(Boolean);

    const result = await model.generateContent({
      contents: historyMessages,
    });
    
    const endTime = Date.now(); // Record end time
    const totalTime = endTime - startTime; // Calculate total time taken

    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply generated';

    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);

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

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'gemini-2.5-flash',
      reply,
      total_time: totalTime, // Add total time to response data
    };

    // Fix: Used `upsert: true` with `findOneAndUpdate` to simplify logic.
    // This creates the document if it doesn't exist, eliminating the need for a separate `if (!deepseekSession)` block.
    // Recommendation: Ensure that `user` and `sessionId` fields in the `ChatHistory` model are indexed
    // for efficient lookups: `ChatHistorySchema.index({ user: 1, sessionId: 1 });`
    const geminiSession = await ChatHistory.findOneAndUpdate(
      { user: userId, sessionId },
      { $push: { responses: responseData } },
      { new: true, upsert: true } // Return the updated/created document
    );

    // Fix: Changed `llamaAiSessions` to `geminiAiSessions` for consistency with the AI model used.
    // Used `$addToSet` to ensure the session ID is added to the user's sessions array only if it's not already present,
    // preventing duplicate entries.
    await UserModel.findByIdAndUpdate(userId, {
      $addToSet: { geminiAiSessions: geminiSession._id },
    });
    
    const payload = { prompt, sessionId, reply };

    // Fix: Removed redundant `if (payload)` check as payload will always be a truthy object.
    await RedisClient.publish(
      GEMINI_RESPONSE_SERVICE_POST, // Fix: Renamed constant to reflect Gemini usage
      JSON.stringify(payload)
    );
    return payload;
  } catch (error) {
    logger.error('Error in geminiResponseService:', error); // Fix: Renamed service function in log
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

/**
 * Exports an object containing all Gemini-related service functions.
 * @type {{geminiResponseService: Function}}
 */
export const geminiServices = { // Fix: Renamed exported object to reflect Gemini usage
  geminiResponseService,
};