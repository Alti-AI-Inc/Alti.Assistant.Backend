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

// Removed `model1` as it was a duplicate of `model`.
// Removed `sessionMemoryStore` and `sessionMemoryStore25Preview` as they were in-memory global stores
// that would lose state on process restart or in scaled environments, leading to loss of conversation context.
// Chat history will now be loaded dynamically from the database for each request.

/**
 * Handles the core interaction with the Gemini AI model, manages chat history,
 * tracks prompt usage, and persists conversation data for a given session and user.
 * This internal helper function centralizes logic for both primary and preview services,
 * ensuring consistent behavior and avoiding code duplication.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @param {import('@google/generative-ai').GenerativeModel} modelToUse - The Gemini model instance to use for generation.
 * @param {boolean} shouldPublishToRedis - Flag to determine if the response should be published to Redis.
 * @returns {Promise<object>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const _handleGeminiInteraction = async (
  sessionId,
  prompt,
  userId,
  modelToUse,
  shouldPublishToRedis
) => {
  try {
    // Dynamically load chat history from the database for the current session.
    // This ensures conversation context is maintained across restarts and scaled instances,
    // addressing the bug of ephemeral in-memory stores.
    const existingChatHistoryDoc = await ChatHistory.findOne({ user: userId, sessionId });

    const chatHistory = new InMemoryChatMessageHistory();
    if (existingChatHistoryDoc && existingChatHistoryDoc.responses) {
      for (const response of existingChatHistoryDoc.responses) {
        chatHistory.addMessage(new HumanMessage(response.prompt));
        chatHistory.addMessage(new AIMessage(response.reply));
      }
    }

    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistory,
    });

    // Enhance prompt using UnifiedSmartRouter for real-time market data
    const enhancedPrompt =
      await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Gemini AI to generate a response
    const result = await modelToUse.generateContent(enhancedPrompt);
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No reply generated';

    // Handle prompt usage increment and potential payment issues
    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      logger.error('Error in incrementPromptsUsed:', error);
      // Re-throw as ApiError to be caught by the outer try-catch or handled upstream
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'gemini-2.5-flash', // Model name is hardcoded, ensure it matches `modelToUse` if dynamic models are introduced
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
      // Only update UserModel if a new session was created.
      // Corrected field name from `llamaAiSessions` to `geminiAiSessions` for consistency
      // with the service's purpose. If `geminiAiSessions` does not exist, Mongoose will add it.
      await UserModel.findByIdAndUpdate(userId, {
        $push: { geminiAiSessions: newGeminiSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
    if (shouldPublishToRedis && payload) {
      await RedisClient.publish(
        GEMINI_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (err) {
    logger.error('Gemini Service Error:', err);
    // Re-throw the original ApiError if it's already an ApiError,
    // otherwise wrap it in a generic ApiError. This ensures specific errors
    // (like payment issues) are propagated correctly.
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Gemini Service failed'
    );
  }
};

/**
 * Handles interaction with the Gemini AI model, manages chat history, tracks prompt usage,
 * and persists conversation data for a given session and user. This is the primary service.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<object>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const geminiService = async (sessionId, prompt, userId) => {
  // Uses the shared internal handler with Redis publishing enabled.
  return _handleGeminiInteraction(sessionId, prompt, userId, model, true);
};

/**
 * Handles interaction with a Gemini AI model instance (currently identical to the primary model),
 * manages chat history, tracks prompt usage, and persists conversation data for a given session and user.
 * This service is functionally very similar to `geminiService` but does not publish to Redis.
 * It might be intended for a preview or alternative model version.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<object>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const gemini25PreviewService = async (sessionId, prompt, userId) => {
  // Uses the shared internal handler with Redis publishing disabled.
  // Note: If a different model or configuration is truly intended for a "preview",
  // `model` should be replaced with a distinct `modelPreview` instance.
  return _handleGeminiInteraction(sessionId, prompt, userId, model, false);
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