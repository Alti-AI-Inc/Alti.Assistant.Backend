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
  logger.info({
    message: 'Redirecting Groq completions Request to Google Gemini 3.1 Flash exclusively.',
    severity: 'INFO',
    sessionId,
    userId
  });
  return GeminiAiService.geminiService(sessionId, prompt, userId);
};

/**
 * @typedef {Object} DBChatMessage
 * @property {'human'|'ai'} type - The type of the message (human or AI).
 * @property {string} content - The text content of the message.
 */

/**
 * @description Converts an array of database-stored message objects into Langchain BaseMessage instances.
 * Assumes the database message objects have 'type' ('human' or 'ai') and 'content' fields.
 * @param {DBChatMessage[]} dbMessages - An array of message objects from the database.
 * @returns {import('@langchain/core/messages').BaseMessage[]} An array of Langchain BaseMessage instances.
 */
const toLangchainMessages = (dbMessages) => {
  return dbMessages.map(msg => {
    if (msg.type === 'human') {
      return new HumanMessage(msg.content);
    } else if (msg.type === 'ai') {
      return new AIMessage(msg.content);
    }
    logger.warn({
      message: `Unknown message type encountered in DB: ${msg.type}`,
      severity: 'WARNING',
      type: msg.type
    });
    return null; // Filter out unknown types
  }).filter(Boolean);
};

/**
 * @description Converts an array of Langchain BaseMessage instances into database-storable message objects.
 * @param {import('@langchain/core/messages').BaseMessage[]} lcMessages - An array of Langchain BaseMessage instances.
 * @returns {DBChatMessage[]} An array of database-storable message objects.
 */
const toDbMessages = (lcMessages) => {
  return lcMessages.map(msg => ({
    type: msg._getType(), // 'human' or 'ai'
    content: msg.text,
  }));
};

/**
 * @description Handles anonymous, search-enhanced AI completions by redirecting requests
 * to the Google Gemini 3.1 Flash service. This service manages session memory,
 * enhances prompts with real-time market data, fetches search results, and constructs
 * a rich context for the AI model to generate a response.
 *
 * This function now persists anonymous chat history to the `ChatHistory` MongoDB model,
 * ensuring scalability and data persistence across server restarts or multiple instances.
 *
 * @param {string} prompt - The user's input prompt for the AI.
 * @param {string} [sessionIdFromClient] - An optional unique identifier for the current chat session.
 *                                         If not provided, a new UUID will be generated.
 * @returns {Promise<Object>} A promise that resolves to an object containing the session ID,
 *                            the original prompt, the AI's reply, and any fetched search results.
 * @throws {ApiError} If the prompt is missing or other internal errors occur.
 */
const GroqAiGetResponseAnonymousService = async (
  prompt,
  sessionIdFromClient
) => {
  const sessionId = sessionIdFromClient || randomUUID(); // Unique session ID if not provided

  if (!prompt) {
    // Changed httpStatus.NOT_FOUND to httpStatus.BAD_REQUEST for missing prompt
    throw new ApiError(httpStatus.BAD_REQUEST, 'Prompt is required.');
  }

  // Fetch or create chat history document for the anonymous session
  // Optimization Recommendation: Ensure an index exists on `sessionId` in the `ChatHistory` model schema for efficient lookups.
  // Note: .lean() is not used here because the 'chatHistoryDoc' object is modified and its .save() method is called later.
  let chatHistoryDoc = await ChatHistory.findOne({ sessionId });

  if (!chatHistoryDoc) {
    // Create a new chat history document if none exists for this session
    chatHistoryDoc = await ChatHistory.create({
      sessionId,
      messages: [], // Initialize with an empty array of messages
      // Note: If ChatHistory model requires a 'user' field, this would need adjustment
      // (e.g., storing a placeholder or making the 'user' field optional).
    });
  }

  // Initialize Langchain's InMemoryChatMessageHistory with messages loaded from the database
  const existingLangchainMessages = toLangchainMessages(chatHistoryDoc.messages);
  const inMemoryChatHistory = new InMemoryChatMessageHistory({
    messages: existingLangchainMessages,
  });

  // Initialize BufferMemory with the persistent chat history
  const memory = new BufferMemory({
    returnMessages: true,
    memoryKey: 'history',
    chatHistory: inMemoryChatHistory,
  });

  // Retrieve previous chat history from the initialized memory
  let previousMessages = await memory.chatHistory.getMessages();

  // Limit memory size to prevent excessive context
  if (previousMessages.length > MAX_MEMORY_SIZE) {
    // Update the messages array directly in the InMemoryChatMessageHistory instance
    memory.chatHistory.messages = previousMessages.slice(-MAX_MEMORY_SIZE);
    previousMessages = memory.chatHistory.messages; // Ensure previousMessages reflects the sliced version
  }

  // Enhance prompt using massiveSmartRouter for real-time market data
  const enhancedPrompt = await massiveSmartRouter.combinedRouteAndEnhancePrompt(prompt);

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

  // Save the updated messages back to the database
  chatHistoryDoc.messages = toDbMessages(await memory.chatHistory.getMessages());
  await chatHistoryDoc.save();

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
  // Optimization: Added .lean() for this read-only query to improve performance by returning a plain JS object instead of a full Mongoose document.
  const sessionData = await UserModel.findOne({
    _id: userId,
  })
    .select('email profile')
    .populate({
      path: 'llamaAiSessions',
    })
    .lean();
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
  // Optimization: Added .lean() for this read-only query to improve performance.
  // Optimization Recommendation: Ensure an index exists on `sessionId` in the `ChatHistory` model schema for efficient lookups.
  const sessionData = await ChatHistory.findOne({
    sessionId: id,
  }).lean();

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
 * @throws {ApiError} If the LlamaAiSession is not found, or if deletion/user update fails.
 */
const deleteOneLlamaAiSession = async (objectId) => {
  // Optimization: Added .lean() for this read-only query to fetch user data before deletion.
  // Optimization Recommendation: If `ChatHistory` documents are frequently looked up or linked by a `user` field,
  // ensure an index exists on `ChatHistory.user` for efficient queries.
  const userData = await ChatHistory.findOne({
    _id: objectId,
  }).lean();
  if (!userData) {
    // Changed to ApiError for consistency in error handling
    throw new ApiError(httpStatus.NOT_FOUND, 'LlamaAiSession not found');
  }
  const deleteResult = await ChatHistory.deleteOne({
    _id: objectId,
  });

  if (deleteResult.deletedCount === 1) {
    const userUpdateResult = await UserModel.updateOne(
      { _id: userData.user },
      { $pull: { llamaAiSessions: objectId } }
    );

    logger.info({
      message: 'userUpdateResult userUpdateResult',
      severity: 'INFO',
      userUpdateResult
    });

    if (userUpdateResult.modifiedCount === 1) {
      return {
        success: true,
        message: 'LlamaAiSession and user reference deleted successfully',
      };
    } else {
      // Changed to ApiError for consistency in error handling
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update the user model');
    }
  } else {
    // Changed to ApiError for consistency in error handling
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete the LlamaAiSession');
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

    // Optimization: Added .lean() for this read-only query to get session IDs.
    const user = await UserModel.findById(userId).session(session).lean();
    if (
      !user ||
      !user.llamaAiSessions ||
      !Array.isArray(user.llamaAiSessions)
    ) {
      // Changed to ApiError for consistency in error handling
      throw new ApiError(httpStatus.NOT_FOUND, 'User or LlamaAiSession data not found');
    }

    const aiSessionIds = user.llamaAiSessions.map((id) => id.toString());

    // Optimization: Using a single deleteMany operation is highly efficient for bulk deletion, avoiding N+1 query problems.
    const deleteResult = await ChatHistory.deleteMany({ _id: { $in: aiSessionIds } }).session(session);

    // Check if all intended sessions were deleted
    if (aiSessionIds.length > 0 && deleteResult.deletedCount !== aiSessionIds.length) {
      // This check ensures that if there were IDs to delete, the count matches.
      // If aiSessionIds is empty, deletedCount will be 0, and the condition won't trigger.
      // Changed to ApiError for consistency in error handling
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete all specified AI sessions');
    }

    const userUpdateResult = await UserModel.updateOne(
      { _id: userId },
      { $pull: { llamaAiSessions: { $in: aiSessionIds } } }
    ).session(session);

    if (userUpdateResult.acknowledged && userUpdateResult.modifiedCount > 0) {
      await session.commitTransaction();
      session.endSession();
      return {
        statusCode: httpStatus.OK, // Explicitly set status code for success
        success: true,
        message: 'AI sessions and user references deleted successfully',
      };
    } else {
      // If no sessions were in llamaAiSessions, modifiedCount might be 0, but the operation is still successful.
      // We should only throw if there were sessions to pull but the update failed.
      if (aiSessionIds.length > 0) {
        // Changed to ApiError for consistency in error handling
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update the user model');
      } else {
        // No sessions to pull, so user model didn't need modification. Consider it successful.
        await session.commitTransaction();
        session.endSession();
        return {
          statusCode: httpStatus.OK, // Explicitly set status code for success
          success: true,
          message: 'No AI sessions to delete or user references to update.',
        };
      }
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error({
      message: 'An error occurred during deleteAllAiSessionsService execution',
      severity: 'ERROR',
      error: error.message || error,
      stack: error.stack
    });
    return {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR, // Added status code for consistency in error returns
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