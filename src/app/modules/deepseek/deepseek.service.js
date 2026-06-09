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
import { DEEPSEEK_RESPONSE_SERVICE_POST } from './deepseek.constatn.js';
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
const deepseekResponseService = async (prompt, userId, sessionId) => {
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionMemoryStore[sessionId] = memory;
  }

  try {
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    const startTime = Date.now(); // Record start time

    // Call Google Generative AI to generate a response using the gemini-2.5-flash model
    const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    
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

    let deepseekSession = await ChatHistory.findOne({ user: userId, sessionId });

    if (deepseekSession) {
      deepseekSession.responses.push(responseData);
      await deepseekSession.save();
    } else {
      deepseekSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: deepseekSession._id },
      });
    }
    const payload = { prompt, sessionId, reply };

    if (payload) {
      await RedisClient.publish(
        DEEPSEEK_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (error) {
    logger.error('Error in deepseekResponseService:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

/**
 * Exports an object containing all Deepseek-related service functions.
 * @type {{deepseekResponseService: Function}}
 */
export const deepseekServices = {
  deepseekResponseService,
};