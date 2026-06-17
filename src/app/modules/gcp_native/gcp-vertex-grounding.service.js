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
// Bug Fix: Move dynamic import to static import for performance and consistency.
import { UnifiedSmartRouter } from '../../helpers/UnifiedSmartRouter.js';

/**
 * @typedef {import('@google/genai').GoogleGenerativeAI} GoogleGenerativeAI
 * @typedef {import('@google/genai').GenerateContentResult} GenerateContentResult
 * @typedef {import('@google/genai').GroundingMetadata} GroundingMetadata
 * @typedef {import('@google/genai').Content} Content
 */

/**
 * Initializes the standard modern GoogleGenAI client with the API key from configuration.
 * @type {GoogleGenAI}
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * A store for managing chat memories for different sessions,
 * allowing for persistent conversation history within the service.
 * Bug Fix: Changed to Map to store memory objects with their last accessed timestamp
 *          to enable cleanup and prevent memory leaks.
 * @type {Map<string, { memory: BufferMemory, lastAccessed: number }>}
 */
const groundedMemoryStore = new Map();

// Configuration for memory cleanup
const SESSION_TTL_MINUTES = 30; // Sessions expire after 30 minutes of inactivity
const CLEANUP_INTERVAL_MINUTES = 10; // Check for expired sessions every 10 minutes

/**
 * Cleans up expired sessions from the groundedMemoryStore.
 * Sessions are considered expired if they haven't been accessed for SESSION_TTL_MINUTES.
 * This function is executed periodically by a `setInterval` timer.
 */
const cleanupMemoryStore = () => {
  const now = Date.now();
  const expiredTime = now - SESSION_TTL_MINUTES * 60 * 1000; // Convert minutes to milliseconds

  for (const [sessionId, sessionEntry] of groundedMemoryStore.entries()) {
    if (sessionEntry.lastAccessed < expiredTime) {
      logger.info(`Cleaning up expired session memory for sessionId: ${sessionId}`);
      groundedMemoryStore.delete(sessionId);
    }
  }
};

// Start the cleanup interval to periodically remove expired sessions.
setInterval(cleanupMemoryStore, CLEANUP_INTERVAL_MINUTES * 60 * 1000);
// Ensure the interval doesn't prevent Node.js from exiting if no other tasks are running.
// This is generally not an issue in a long-running Express app.
// If it were, `unref()` could be used: `setInterval(...).unref();`


/**
 * Executes a Gemini model query with active Google Search Grounding using the modern GenAI SDK.
 * It enhances the prompt, manages chat history, increments user prompt usage,
 * saves the conversation to the database, and publishes the response to Redis.
 * This service requires a valid user context (`userId`) to track usage and save history.
 * Access is implicitly controlled by the payment/subscription status checked via `paymentController`.
 *
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt for the Gemini model.
 * @param {string} userId - The ID of the user making the request. This is a multi-tenant context parameter.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string, groundingMetadata: object}>} A promise that resolves to an object containing the prompt,
 *   session ID, the AI's reply, and grounding metadata.
 * @throws {ApiError} If an error occurs during prompt enhancement, Gemini API call,
 *   prompt usage increment, or database operations.
 */
const groundedPromptResponse = async (sessionId, prompt, userId) => {
  // Bug Fix: Retrieve and update session entry from Map, handling lastAccessed timestamp.
  let sessionEntry = groundedMemoryStore.get(sessionId);
  let memory;

  if (!sessionEntry) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionEntry = { memory, lastAccessed: Date.now() };
    groundedMemoryStore.set(sessionId, sessionEntry);
  } else {
    memory = sessionEntry.memory;
    // Update last accessed time to prevent premature eviction
    sessionEntry.lastAccessed = Date.now();
  }

  try {
    // Bug Fix: UnifiedSmartRouter is now statically imported at the top of the file.
    const enhancedPrompt = await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call modern Gemini AI with active search grounding and gemini-3.1-pro reasoning engine
    logger.info(`Sending prompt with live Google Search Grounding using gemini-3.1-pro: "${prompt.slice(0, 50)}..."`);
    
    /** @type {GenerateContentResult} */
    const result = await ai.models.generateContent({
      model: 'gemini-3.1-pro',
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
        const err = new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
        logger.error('Error incrementing prompts usage in grounding service:', err);
        throw err;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error('Error incrementing prompts usage in grounding service:', error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'An error occurred while updating prompt usage.'
      );
    }

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'gemini-3.1-pro-grounded',
      reply,
      groundingMetadata,
      // Bug Fix: Renamed 'total_time' to 'output_tokens' as it reflects token count, not time.
      output_tokens: result.usageMetadata?.candidatesTokenCount || 0,
    };

    // Save prompt & response session in DB
    // Optimization: Use findOneAndUpdate with upsert: true and lean: true for atomic update/create without Mongoose overhead.
    // Recommendation: For optimal performance, ensure an index exists on ChatHistory:
    // db.chathistories.createIndex({ user: 1, sessionId: 1 })
    const updatedSession = await ChatHistory.findOneAndUpdate(
      { user: userId, sessionId },
      {
        $push: { responses: responseData },
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create a new document if no document matches the filter
        setDefaultsOnInsert: true, // Apply schema defaults when creating a new document
        lean: true, // Optimization: Returns a plain JS object instead of a heavy Mongoose document
      }
    );

    // Optimization: Use updateOne instead of findByIdAndUpdate to avoid retrieving the document from DB,
    // saving CPU and memory since the returned user document is not used.
    await UserModel.updateOne(
      { _id: userId },
      // Bug Fix: Changed 'llamaAiSessions' to 'geminiAiSessions' for consistency with the service.
      { $addToSet: { geminiAiSessions: updatedSession._id } }
    );

    const payload = { prompt, sessionId, reply, groundingMetadata };
    
    // Publish response to Redis channels
    await RedisClient.publish(
      'GEMINI_RESPONSE_SERVICE_POST',
      JSON.stringify(payload)
    );

    return payload;
  } catch (err) {
    logger.error('GCP Vertex Grounding Service Error:', err);
    if (err instanceof ApiError) {
      throw err;
    }
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
   * This service requires a valid user context (`userId`) to track usage and save history.
   * Access is implicitly controlled by the payment/subscription status checked via `paymentController`.
   * @function
   * @memberof GcpVertexGroundingService
   * @param {string} sessionId - The unique identifier for the current chat session.
   * @param {string} prompt - The user's input prompt.
   * @param {string} userId - The ID of the user. This is a multi-tenant context parameter.
   * @returns {Promise<{prompt: string, sessionId: string, reply: string, groundingMetadata: object}>} The AI's response including the original prompt, session ID, reply, and grounding metadata.
   * @throws {ApiError} If the grounding service encounters an error.
   */
  groundedPromptResponse,
};