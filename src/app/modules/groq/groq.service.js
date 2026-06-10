import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import mongoose from 'mongoose';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { fetchSearchResults } from './groq.utilities.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';
import { GeminiAiService } from '../gemini/gemini.service.js';

/**
 * @typedef {Object.<string, BufferMemory>} AnonymousSessionMemoryStore
 * @description Stores in-memory chat history for anonymous user sessions.
 * Each key is a session ID, and its value is a BufferMemory instance.
 */
const AnonymousSessionMemoryStore = {}; // Stores session memory for each user session

/**
 * @constant {number} MAX_MEMORY_SIZE
 * @description Defines the maximum number of chat messages to retain in memory for a session.
 * This prevents excessive context accumulation and manages memory usage.
 */
const MAX_MEMORY_SIZE = 12; // Limits stored messages per session

/**
 * @description Redirects user-registered Groq completions requests to the Google Gemini 3.1 Flash service.
 * This function acts as a proxy, ensuring that all Groq-related AI interactions for registered users
 * are handled by the Gemini AI service for consistency and potentially enhanced capabilities.
 *
 * @param {string} prompt - The user's input prompt for the AI.
 * @param {string} userId - The ID of the registered user making the request.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @returns {Promise<Object>} A promise that resolves to the AI's response,
 *                            delegated from the Gemini AI service.
 */
const getAiResponsesGroqService = async (prompt, userId, sessionId) => {
  logger.info(
    `Redirecting Groq completions Request to Google Gemini 3.1 Flash exclusively.`
  );
  return GeminiAiService.geminiService(sessionId, prompt, userId);
};

/**
 * @description Handles anonymous, search-enhanced AI completions by redirecting requests
 * to the Google Gemini 3.1 Flash service. This service manages session memory,
 * enhances prompts with real-time market data, fetches search results, and constructs
 * a rich context for the AI model to generate a response.
 *
 * @param {string} prompt - The user's input prompt for the AI.
 * @param {string} [sessionIdFromClient] - An optional unique identifier for the current chat session.
 *                                         If not provided, a new UUID will be generated.
 * @returns {Promise<Object>} A promise that resolves to an object containing the session ID,
 *                            the original prompt, the AI's reply, and any fetched search results.
 * @throws {ApiError} If the prompt is missing.
 */
const GroqAiGetResponseAnonymousService = async (
  prompt,
  sessionIdFromClient
) => {
  const sessionId = sessionIdFromClient || randomUUID(); // Unique session ID if not provided

  if (!prompt) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Prompt is required.');
  }

  // Enhance prompt using massiveSmartRouter for real-time market data
  const enhancedPrompt = await massiveSmartRouter.combinedRouteAndEnhancePrompt(prompt);

  // Initialize memory if it doesn't exist for this session
  if (!AnonymousSessionMemoryStore[sessionId]) {
    AnonymousSessionMemoryStore[sessionId] = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(), // Chat history storage
    });
  }
  const memory = AnonymousSessionMemoryStore[sessionId];

  // Retrieve previous chat history
  const previousMessages = await memory.chatHistory.getMessages();

  // Limit memory size to prevent excessive context
  if (previousMessages.length > MAX_MEMORY_SIZE) {
    memory.chatHistory.messages = previousMessages.slice(-MAX_MEMORY_SIZE);
  }

  // Fetch real-time search results from Serper
  const searchResults = await fetchSearchResults(prompt);
  const searchContext = searchResults
    .map((result, index) => `${index + 1}. ${result.title}: ${result.link}`)
    .join('\n');

  // Prepare conversation context (previous memory + search results)
  const enrichedPrompt = searchResults.length
    ? `[SYSTEM INSTRUCTION - ACTIVE ELITE WEB SEARCH]
You are a highly accurate, extremely fast real-time search engine competing with Perplexity. 
Follow these rules strictly:
1. Answer the user query directly, simply, and clearly. Never include greeting, filler, conversational preamble, or throat-clearing.
2. Rely 100% on the Real-Time Search Info provided below. Do not speculate or hallucinate.
3. Be extremely concise to maximize response speed and minimize generation latency.
4. Cite your facts inline using brackets corresponding to the search index numbers below (e.g., "[1]", "[2]") so the user can trace back sources perfectly.

Real-Time Search Info:
${searchContext}

Previous Conversation:
${previousMessages
  .map((msg) => `${msg._getType().toUpperCase()}: ${msg.text}`)
  .join('\n')}

User Query: ${enhancedPrompt}`
    : `[SYSTEM INSTRUCTION - ACTIVE ELITE SEARCH]
Answer the user query directly, simply and concisely. Never include conversational preamble or throat-clearing.
Be extremely concise to maximize response speed.

Previous Conversation:
${previousMessages
  .map((msg) => `${msg._getType().toUpperCase()}: ${msg.text}`)
  .join('\n')}

User Query: ${enhancedPrompt}`;

  // Initialize Google Gemini model
  const client = new GoogleGenerativeAI(config.gemini_secret_key);
  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Add the new user message to memory
  await memory.chatHistory.addMessage(new HumanMessage(prompt));

  // Generate response using Google Gemini
  const result = await model.generateContent(enrichedPrompt);
  const reply =
    result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
    'No reply generated';

  // Store AI response in chat history
  await memory.chatHistory.addMessage(new AIMessage(reply));

  // Prepare response
  const responseData = {
    sessionId,
    prompt,
    reply,
    search_results: searchResults, // Include search results in response
  };

  return responseData;
};

/**
 * @description Retrieves all AI chat sessions associated with a specific user ID.
 * It populates the 'llamaAiSessions' field from the User model to fetch detailed
 * session information.
 *
 * @param {string} userId - The unique identifier of the user.
 * @returns {Promise<Object>} A promise that resolves to the user's session data
 *                            or an error object if the user/session is not found.
 */
const getAiResponsesByUserIdService = async (userId) => {
  // Optimization: Added .lean() for read-only query to improve performance
  const sessionData = await UserModel.findOne({
    _id: userId,
  })
    .select('email profile')
    .populate({
      path: 'llamaAiSessions',
    })
    .lean(); // Added .lean()
  if (!sessionData) {
    return {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Session not found',
      reply: sessionData,
    };
  }
  return sessionData;
};

/**
 * @description Retrieves a single AI chat session by its unique session ID.
 *
 * @param {string} id - The unique identifier of the chat session.
 * @returns {Promise<Object>} A promise that resolves to the chat session data
 *                            or an error object if the session is not found.
 * @remarks Ensure an index exists on `sessionId` in the ChatHistory model schema for efficient lookups.
 */
const getAiResponsesBySession = async (id) => {
  // Optimization: Added .lean() for read-only query to improve performance
  const sessionData = await ChatHistory.findOne({
    sessionId: id,
  }).lean(); // Added .lean()

  if (!sessionData) {
    return {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Session not found',
      response: sessionData,
    };
  }
  return sessionData;
};

/**
 * @description Deletes a single AI chat session by its MongoDB ObjectId and removes
 * its reference from the associated user's `llamaAiSessions` array.
 * This operation ensures data consistency across related models.
 *
 * @param {string} objectId - The MongoDB ObjectId of the chat session to delete.
 * @returns {Promise<Object>} A promise that resolves to an object indicating
 *                            the success of the deletion and update operation.
 * @throws {Error} If the LlamaAiSession is not found, or if deletion/user update fails.
 */
const deleteOneLlamaAiSession = async (objectId) => {
  // Optimization: Added .lean() for read-only query to improve performance
  const userData = await ChatHistory.findOne({
    _id: objectId,
  }).lean(); // Added .lean()
  if (!userData) {
    throw new Error('LlamaAiSession not found');
  }
  const deleteResult = await ChatHistory.deleteOne({
    _id: objectId,
  });

  if (deleteResult.deletedCount === 1) {
    const userUpdateResult = await UserModel.updateOne(
      { _id: userData.user },
      { $pull: { llamaAiSessions: objectId } }
    );

    logger.info(userUpdateResult, 'userUpdateResult userUpdateResult');

    if (userUpdateResult.modifiedCount === 1) {
      return {
        success: true,
        message: 'LlamaAiSession and user reference deleted successfully',
      };
    } else {
      throw new Error('Failed to update the user model');
    }
  } else {
    throw new Error('Failed to delete the LlamaAiSession');
  }
};

/**
 * @description Deletes all AI chat sessions associated with a given user ID and
 * removes their references from the user's `llamaAiSessions` array.
 * This operation is performed within a MongoDB transaction to ensure atomicity
 * and data consistency.
 *
 * @param {string} userId - The unique identifier of the user whose sessions are to be deleted.
 * @returns {Promise<Object>} A promise that resolves to an object indicating
 *                            the success or failure of the bulk deletion operation.
 */
const deleteAllAiSessionsService = async (userId) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // Optimization: Added .lean() for read-only query to improve performance
    const user = await UserModel.findById(userId).session(session).lean(); // Added .lean()
    if (
      !user ||
      !user.llamaAiSessions ||
      !Array.isArray(user.llamaAiSessions)
    ) {
      throw new Error('User or LlamaAiSession data not found');
    }

    const aiSessionIds = user.llamaAiSessions.map((id) => id.toString());

    // Optimization: Replaced N+1 delete operations with a single deleteMany for efficiency
    const deleteResult = await ChatHistory.deleteMany({ _id: { $in: aiSessionIds } }).session(session);

    // Check if all intended sessions were deleted
    if (aiSessionIds.length > 0 && deleteResult.deletedCount !== aiSessionIds.length) {
      // This check ensures that if there were IDs to delete, the count matches.
      // If aiSessionIds is empty, deletedCount will be 0, and the condition won't trigger.
      throw new Error('Failed to delete all specified AI sessions');
    }

    const userUpdateResult = await UserModel.updateOne(
      { _id: userId },
      { $pull: { llamaAiSessions: { $in: aiSessionIds } } }
    ).session(session);

    if (userUpdateResult.acknowledged && userUpdateResult.modifiedCount > 0) {
      await session.commitTransaction();
      session.endSession();
      return {
        statusCode: 200,
        success: true,
        message: 'AI sessions and user references deleted successfully',
      };
    } else {
      // If no sessions were in llamaAiSessions, modifiedCount might be 0, but the operation is still successful.
      // We should only throw if there were sessions to pull but the update failed.
      if (aiSessionIds.length > 0) {
        throw new Error('Failed to update the user model');
      } else {
        // No sessions to pull, so user model didn't need modification. Consider it successful.
        await session.commitTransaction();
        session.endSession();
        return {
          statusCode: 200,
          success: true,
          message: 'No AI sessions to delete or user references to update.',
        };
      }
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('An error occurred:', error);
    return {
      success: false,
      message: 'An internal server error occurred',
      error: error.message,
    };
  }
};

/**
 * @namespace LlamaAiService
 * @description Provides a collection of services for managing AI chat interactions,
 * including generating responses, retrieving chat history, and managing sessions.
 * This service primarily acts as a proxy or orchestrator for Groq-related requests,
 * redirecting them to the Google Gemini AI service and handling anonymous sessions
 * with search enhancement and memory management.
 */
export const LlamaAiService = {
  /**
   * @function getAiResponsesGroqService
   * @memberof LlamaAiService
   * @description Redirects user-registered Groq completions requests to the Google Gemini 3.1 Flash service.
   * @see {@link getAiResponsesGroqService} for implementation details.
   */
  getAiResponsesGroqService,
  /**
   * @function GroqAiGetResponseAnonymousService
   * @memberof LlamaAiService
   * @description Handles anonymous, search-enhanced AI completions by redirecting requests
   * to the Google Gemini 3.1 Flash service, managing session memory and search context.
   * @see {@link GroqAiGetResponseAnonymousService} for implementation details.
   */
  GroqAiGetResponseAnonymousService,
  /**
   * @function getAiResponsesByUserIdService
   * @memberof LlamaAiService
   * @description Retrieves all AI chat sessions associated with a specific user ID.
   * @see {@link getAiResponsesByUserIdService} for implementation details.
   */
  getAiResponsesByUserIdService,
  /**
   * @function getAiResponsesBySession
   * @memberof LlamaAiService
   * @description Retrieves a single AI chat session by its unique session ID.
   * @see {@link getAiResponsesBySession} for implementation details.
   */
  getAiResponsesBySession,
  /**
   * @function deleteOneLlamaAiSession
   * @memberof LlamaAiService
   * @description Deletes a single AI chat session by its MongoDB ObjectId and removes
   * its reference from the associated user's `llamaAiSessions` array.
   * @see {@link deleteOneLlamaAiSession} for implementation details.
   */
  deleteOneLlamaAiSession,
  /**
   * @function deleteAllAiSessionsService
   * @memberof LlamaAiService
   * @description Deletes all AI chat sessions associated with a given user ID and
   * removes their references from the user's `llamaAiSessions` array, using a transaction.
   * @see {@link deleteAllAiSessionsService} for implementation details.
   */
  deleteAllAiSessionsService,
};