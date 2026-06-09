/**
 * @file This file provides services for interacting with the Google Gemini AI model,
 * managing chat history, tracking prompt usage, and persisting conversation data.
 * It integrates with various internal modules for enhanced functionality like
 * prompt routing and payment processing.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { GEMINI_RESPONSE_SERVICE_POST } from './gemini.constant.js';
import { RedisClient } from '../../../shared/redis.js';
import { UnifiedSmartRouter } from '../../helpers/UnifiedSmartRouter.js';

/**
 * Initializes the Google Generative AI client with the configured API key.
 * @type {GoogleGenerativeAI}
 */
const client = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Configures the primary Gemini AI model for content generation.
 * Uses 'gemini-2.5-flash' with a low temperature for more deterministic responses.
 * @type {import('@google/generative-ai').GenerativeModel}
 */
const model = client.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.1 },
});

/**
 * An in-memory store for chat session histories, keyed by sessionId.
 * Each entry holds a BufferMemory instance for maintaining conversation context.
 * @type {Object.<string, BufferMemory>}
 */
const sessionMemoryStore = {};

/**
 * Handles interaction with the Gemini AI model, manages chat history, tracks prompt usage,
 * and persists conversation data for a given session and user.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<object>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const geminiService = async (sessionId, prompt, userId) => {
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
    // Enhance prompt using UnifiedSmartRouter for real-time market data
    const enhancedPrompt =
      await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Gemini AI to generate a response
    const result = await model.generateContent(enhancedPrompt);
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No reply generated';

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
      total_time: result?.usage?.total_time || 0,
    };

    // Optimization: Use updateOne to push to responses array directly,
    // then check if a new document needs to be created.
    // This avoids fetching the full document, modifying it in memory, and then saving it.
    // Recommended Index: For ChatHistory model, create a compound index on `{ user: 1, sessionId: 1 }`
    // to optimize the lookup for both update and create operations.
    const updateResult = await ChatHistory.updateOne(
      { user: userId, sessionId },
      { $push: { responses: responseData } }
    );

    if (updateResult.modifiedCount === 0) {
      // If no document was modified, it means the session didn't exist, so create a new one
      const newGeminiSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      // Only update UserModel if a new session was created
      // Recommended Index: For UserModel, `_id` is indexed by default.
      // If `llamaAiSessions` is frequently queried, consider an index on it.
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: newGeminiSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
    if (payload) {
      await RedisClient.publish(
        GEMINI_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (err) {
    logger.error('Gemini Service Error:', err);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Gemini Service failed'
    );
  }
};

/**
 * Configures an additional Gemini AI model instance, identical to the primary `model`.
 * This might be used for specific scenarios or A/B testing, though currently it's a duplicate.
 * Uses 'gemini-2.5-flash' with a low temperature.
 * @type {import('@google/generative-ai').GenerativeModel}
 */
const model1 = client.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.1 },
});

/**
 * An in-memory store for chat session histories specifically for the gemini25PreviewService,
 * keyed by sessionId. Each entry holds a BufferMemory instance.
 * @type {Object.<string, BufferMemory>}
 */
const sessionMemoryStore25Preview = {};

/**
 * Handles interaction with a Gemini AI model instance (currently identical to the primary model),
 * manages chat history, tracks prompt usage, and persists conversation data for a given session and user.
 * This service is functionally very similar to `geminiService` but uses a separate memory store
 * and does not publish to Redis. It might be intended for a preview or alternative model version.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<object>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const gemini25PreviewService = async (sessionId, prompt, userId) => {
  let memory = sessionMemoryStore25Preview[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionMemoryStore25Preview[sessionId] = memory;
  }

  try {
    // Enhance prompt using UnifiedSmartRouter for real-time market data
    const enhancedPrompt =
      await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Gemini AI to generate a response
    const result = await model1.generateContent(enhancedPrompt);
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No reply generated';

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
      total_time: result?.usage?.total_time || 0,
    };

    // Optimization: Use updateOne to push to responses array directly,
    // then check if a new document needs to be created.
    // This avoids fetching the full document, modifying it in memory, and then saving it.
    // Recommended Index: For ChatHistory model, create a compound index on `{ user: 1, sessionId: 1 }`
    // to optimize the lookup for both update and create operations.
    const updateResult = await ChatHistory.updateOne(
      { user: userId, sessionId },
      { $push: { responses: responseData } }
    );

    if (updateResult.modifiedCount === 0) {
      // If no document was modified, it means the session didn't exist, so create a new one
      const newGeminiSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      // Only update UserModel if a new session was created
      // Recommended Index: For UserModel, `_id` is indexed by default.
      // If `llamaAiSessions` is frequently queried, consider an index on it.
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: newGeminiSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
    return payload;
  } catch (err) {
    logger.error('Gemini Service Error:', err);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Gemini Service failed'
    );
  }
};

/**
 * Exports an object containing various Gemini AI service functions.
 * @namespace GeminiAiService
 */
export const GeminiAiService = {
  /**
   * The primary service function for interacting with the Gemini AI model.
   * @function
   * @memberof GeminiAiService
   * @param {string} sessionId - The unique identifier for the current chat session.
   * @param {string} prompt - The user's input prompt.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<object>} An object containing the prompt, sessionId, and the AI's reply.
   * @throws {ApiError}
   */
  geminiService,
  /**
   * A service function for interacting with a preview or alternative Gemini AI model instance.
   * @function
   * @memberof GeminiAiService
   * @param {string} sessionId - The unique identifier for the current chat session.
   * @param {string} prompt - The user's input prompt.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<object>} An object containing the prompt, sessionId, and the AI's reply.
   * @throws {ApiError}
   */
  gemini25PreviewService,
};