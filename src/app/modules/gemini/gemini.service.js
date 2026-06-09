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

const client = new GoogleGenerativeAI(config.gemini_secret_key);
const model = client.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.1 },
});

const sessionMemoryStore = {};

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

const model1 = client.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.1 },
});

const sessionMemoryStore25Preview = {};

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

export const GeminiAiService = {
  geminiService,
  gemini25PreviewService,
};