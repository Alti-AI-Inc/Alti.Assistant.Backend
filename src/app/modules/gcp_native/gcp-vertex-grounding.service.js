import { GoogleGenAI } from '@google/genai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { BufferMemory } from 'langchain/memory';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { RedisClient } from '../../../shared/redis.js';

/**
 * @typedef {import('@google/genai').GoogleGenerativeAI} GoogleGenerativeAI
 */

/**
 * Initializes the standard modern GoogleGenAI client with the API key from configuration.
 * @type {GoogleGenerativeAI}
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * A store for managing chat memories for different sessions,
 * allowing for persistent conversation history within the service.
 * @type {Object.<string, BufferMemory>}
 */
const groundedMemoryStore = {};

/**
 * Executes a Gemini model query with active Google Search Grounding using the modern GenAI SDK.
 * It enhances the prompt, manages chat history, increments user prompt usage,
 * saves the conversation to the database, and publishes the response to Redis.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt for the Gemini model.
 * @param {string} userId - The ID of the user making the request.
 * @returns {Promise<object>} A promise that resolves to an object containing the prompt,
 *   session ID, the AI's reply, and grounding metadata.
 * @throws {ApiError} If an error occurs during prompt enhancement, Gemini API call,
 *   prompt usage increment, or database operations.
 */
const groundedPromptResponse = async (sessionId, prompt, userId) => {
  let memory = groundedMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    groundedMemoryStore[sessionId] = memory;
  }

  try {
    // Enhance prompt using UnifiedSmartRouter for deep context
    const { UnifiedSmartRouter } = await import('../../helpers/UnifiedSmartRouter.js');
    const enhancedPrompt = await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call modern Gemini AI with active search grounding and gemini-2.5-pro reasoning engine
    logger.info(`Sending prompt with live Google Search Grounding using gemini-2.5-pro: "${prompt.slice(0, 50)}..."`);
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: enhancedPrompt,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });
    
    const candidate = result.candidates?.[0];
    const reply = candidate?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      ?.map((part) => part.text)
      ?.join('') || 'No reply generated';
    
    // Parse Grounding Metadata
    const rawGroundingMetadata = candidate?.groundingMetadata || {};
    
    const groundingMetadata = {
      webSearchQueries: rawGroundingMetadata.webSearchQueries || [],
      groundingChunks: (rawGroundingMetadata.groundingChunks || []).map(chunk => ({
        title: chunk.web?.title || 'Web Reference',
        uri: chunk.web?.uri || ''
      })),
      searchEntryPoint: rawGroundingMetadata.searchEntryPoint?.renderedContent || ''
    };

    // Increment prompt usage metrics
    try {
      const paymentResult = await paymentController.incrementPromptsUsed(userId);
      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      logger.error('Error incrementing prompts usage in grounding service:', error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'gemini-2.5-pro-grounded',
      reply,
      groundingMetadata,
      total_time: result.usageMetadata?.candidatesTokenCount || 0,
    };

    // Save prompt & response session in DB
    let session = await ChatHistory.findOne({ user: userId, sessionId });
    if (session) {
      session.responses.push(responseData);
      await session.save();
    } else {
      session = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: session._id },
      });
    }

    const payload = { prompt, sessionId, reply, groundingMetadata };
    
    // Publish response to Redis channels
    await RedisClient.publish(
      'GEMINI_RESPONSE_SERVICE_POST',
      JSON.stringify(payload)
    );

    return payload;
  } catch (err) {
    logger.error('GCP Vertex Grounding Service Error:', err);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `GCP Grounding Service failed: ${err.message}`
    );
  }
};

/**
 * Provides services related to GCP Vertex AI with Google Search Grounding.
 * @namespace GcpVertexGroundingService
 */
export const GcpVertexGroundingService = {
  /**
   * Handles a user prompt by sending it to the Gemini model with active Google Search Grounding.
   * It manages session memory, enhances prompts, tracks usage, and stores conversation history.
   * @function
   * @memberof GcpVertexGroundingService
   * @param {string} sessionId - The unique identifier for the current chat session.
   * @param {string} prompt - The user's input prompt.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<object>} The AI's response including grounding metadata.
   * @throws {ApiError} If the grounding service encounters an error.
   */
  groundedPromptResponse,
};