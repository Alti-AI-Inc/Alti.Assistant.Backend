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
 * It now includes critical validation, authorization, and usage tracking.
 *
 * @param {string} prompt - The user's input prompt for the AI.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {Object} requestingUser - The authenticated user object from the request.
 * @returns {Promise<Object>} A promise that resolves to the AI's response,
 *                            delegated from the Gemini AI service.
 * @throws {ApiError} If the user is not authorized, not found, or exceeds usage limits.
 */
const getAiResponsesGroqService = async (prompt, sessionId, requestingUser) => {
  try {
    // FIX: Added comprehensive validation and usage tracking for authenticated users.
    // This prevents unauthorized access and ensures actions are tracked against user/workspace limits.
    if (!requestingUser || !requestingUser._id) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'User authentication is required.');
    }

    // Fetch the full user profile to check limits and permissions.
    const user = await UserModel.findById(requestingUser._id);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
    }

    // CRITICAL INTEGRATION: Check if the user's subscription/role allows AI model usage and if they are within limits.
    // This is a placeholder for more detailed business logic (e.g., checking user.usage.aiTokens against user.limits.aiTokens).
    const usageLimit = user.limits?.aiTokens || 0;
    const currentUsage = user.usage?.aiTokens || 0;

    if (user.role !== 'super_admin' && currentUsage >= usageLimit) {
      // TODO: Propagate notification to manager/admin about limit exhaustion.
      logger.warn({
        message: 'User has reached their AI token limit.',
        userId: user._id,
        workspaceId: user.workspace,
      });
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'You have exceeded your usage limit. Please upgrade your plan or contact your administrator.');
    }

    logger.info({
      message: 'Redirecting Groq completions Request to Google Gemini 3.1 Flash exclusively.',
      severity: 'INFO',
      sessionId,
      userId: user._id.toString()
    });

    // Delegate to the Gemini service, passing the full user object for further context.
    const result = await GeminiAiService.geminiService(sessionId, prompt, user);

    // CRITICAL INTEGRATION: After a successful response, update usage stats.
    // The token count should ideally come from the AI service response.
    // This is a simplified example.
    const tokensUsed = result.tokenCount || 100; // Placeholder for actual token count from Gemini response
    user.usage.aiTokens = currentUsage + tokensUsed;
    await user.save();

    // TODO: Implement logic to notify managers/admins when usage approaches certain thresholds (e.g., 80%, 90%).

    return result;
  } catch (error) {
    logger.error({
      message: `Error in getAiResponsesGroqService for user: ${requestingUser?._id}`,
      error: error.message,
      stack: error.stack,
      sessionId,
    });
    // Re-throw ApiError instances directly, otherwise normalize the error
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred while processing your request.');
  }
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

  try {
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
        // Note: The 'user' field is intentionally left null for anonymous sessions.
        // FIX: For better data segregation, associate anonymous sessions with a default
        // workspace or tenant if context is available (e.g., from request origin/domain).
        // workspace: resolveWorkspaceIdFromRequest(req), // Example placeholder
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
    const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
  } catch (error) {
    logger.error({
      message: `Error in GroqAiGetResponseAnonymousService`,
      error: error.message,
      stack: error.stack,
      sessionId,
    });
    // Re-throw ApiError instances directly, otherwise normalize the error
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred while generating the AI response.');
  }
};

/**
 * @description Retrieves all AI chat sessions associated with a specific user ID, with authorization checks.
 *
 * @param {string} targetUserId - The unique identifier of the user whose sessions are being requested.
 * @param {Object} requestingUser - The authenticated user object making the request.
 * @returns {Promise<Object>} A promise that resolves to the user's session data.
 * @throws {ApiError} If the requesting user is not authorized, or if the target user or session data is not found.
 */
const getAiResponsesByUserIdService = async (targetUserId, requestingUser) => {
  try {
    // FIX: Added authorization to prevent IDOR (Insecure Direct Object Reference).
    // Ensures users can only access their own data, and admins/managers can access data within their scope.
    if (!requestingUser) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required.');
    }

    const targetUser = await UserModel.findById(targetUserId).lean();
    if (!targetUser) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found.');
    }

    const isOwner = requestingUser._id.toString() === targetUserId;
    const isSuperAdmin = requestingUser.role === 'super_admin';
    // Assumes user model has a workspace field for tenancy check
    const isAdminOrManagerOfSameWorkspace =
      (requestingUser.role === 'admin' || requestingUser.role === 'manager') &&
      targetUser.workspace &&
      requestingUser.workspace &&
      requestingUser.workspace.toString() === targetUser.workspace.toString();

    if (!isOwner && !isSuperAdmin && !isAdminOrManagerOfSameWorkspace) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view this user\'s sessions.');
    }

    const sessionData = await UserModel.findOne({
      _id: targetUserId,
    })
      .select('email profile llamaAiSessions')
      .populate({
        path: 'llamaAiSessions',
      })
      .lean();

    if (!sessionData) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User or session data not found');
    }
    return sessionData;
  } catch (error) {
    logger.error({
      message: `Error in getAiResponsesByUserIdService for targetUser: ${targetUserId}`,
      error: error.message,
      stack: error.stack,
      requestingUserId: requestingUser?._id,
    });
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred while retrieving user sessions.');
  }
};

/**
 * @description Retrieves a single AI chat session by its unique session ID, with authorization checks.
 *
 * @param {string} sessionId - The unique identifier of the chat session.
 * @param {Object} requestingUser - The authenticated user object making the request.
 * @returns {Promise<Object>} A promise that resolves to the chat session data.
 * @throws {ApiError} If the session is not found or the user is not authorized.
 */
const getAiResponsesBySession = async (sessionId, requestingUser) => {
  try {
    // FIX: Added authorization to prevent IDOR. Ensures users can only access sessions they own or manage.
    if (!requestingUser) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required.');
    }

    const sessionData = await ChatHistory.findOne({
      sessionId: sessionId,
    }).lean();

    if (!sessionData) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }

    // CRITICAL INTEGRATION: Enforce tenant boundaries and ownership.
    // Anonymous sessions (without a user) must not be retrievable via this authenticated endpoint.
    if (!sessionData.user || !sessionData.workspace) {
        throw new ApiError(httpStatus.FORBIDDEN, 'Access to this session type is not permitted.');
    }

    const isOwner = requestingUser._id.equals(sessionData.user);
    const isSuperAdmin = requestingUser.role === 'super_admin';
    const isAdminOrManagerOfSameWorkspace =
      (requestingUser.role === 'admin' || requestingUser.role === 'manager') &&
      requestingUser.workspace &&
      sessionData.workspace &&
      requestingUser.workspace.equals(sessionData.workspace);

    if (!isOwner && !isSuperAdmin && !isAdminOrManagerOfSameWorkspace) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view this session.');
    }

    return sessionData;
  } catch (error) {
    logger.error({
      message: `Error in getAiResponsesBySession for sessionId: ${sessionId}`,
      error: error.message,
      stack: error.stack,
      requestingUserId: requestingUser?._id,
    });
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred while retrieving the session.');
  }
};

/**
 * @description Deletes a single AI chat session by its MongoDB ObjectId, with authorization checks.
 *
 * @param {string} objectId - The MongoDB ObjectId of the chat session to delete.
 * @param {Object} requestingUser - The authenticated user object making the request.
 * @returns {Promise<Object>} A promise that resolves to an object indicating success.
 * @throws {ApiError} If the session is not found or the user is not authorized.
 */
const deleteOneLlamaAiSession = async (objectId, requestingUser) => {
  try {
    // FIX: Added authorization to prevent IDOR. Ensures only authorized users can delete sessions.
    if (!requestingUser) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required.');
    }

    const sessionToDelete = await ChatHistory.findById(objectId);

    if (!sessionToDelete) {
      throw new ApiError(httpStatus.NOT_FOUND, 'LlamaAiSession not found');
    }

    // CRITICAL INTEGRATION: Enforce tenant boundaries and ownership for deletion.
    if (!sessionToDelete.user || !sessionToDelete.workspace) {
      throw new ApiError(httpStatus.FORBIDDEN, 'This session cannot be deleted through this endpoint.');
    }

    const isOwner = requestingUser._id.equals(sessionToDelete.user);
    const isSuperAdmin = requestingUser.role === 'super_admin';
    const isAdminOrManagerOfSameWorkspace =
      (requestingUser.role === 'admin' || requestingUser.role === 'manager') &&
      requestingUser.workspace &&
      sessionToDelete.workspace &&
      requestingUser.workspace.equals(sessionToDelete.workspace);

    if (!isOwner && !isSuperAdmin && !isAdminOrManagerOfSameWorkspace) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to delete this session.');
    }

    const deleteResult = await ChatHistory.deleteOne({
      _id: objectId,
    });

    if (deleteResult.deletedCount === 1) {
      const userUpdateResult = await UserModel.updateOne(
        { _id: sessionToDelete.user },
        { $pull: { llamaAiSessions: objectId } }
      );

      // FIX: Improved logic to handle cases where user reference might already be gone.
      if (userUpdateResult.matchedCount === 0) {
        logger.warn({
          message: 'Session was deleted, but the corresponding user was not found to update their session list.',
          severity: 'WARNING',
          userId: sessionToDelete.user,
          sessionId: objectId,
        });
      }

      return {
        success: true,
        message: 'LlamaAiSession and user reference updated successfully',
      };
    } else {
      // This case should ideally not be reached if findById succeeds, but it's a safeguard.
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete the LlamaAiSession');
    }
  } catch (error) {
    logger.error({
      message: `Error in deleteOneLlamaAiSession for objectId: ${objectId}`,
      error: error.message,
      stack: error.stack,
      requestingUserId: requestingUser?._id,
    });
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred while deleting the session.');
  }
};

/**
 * @description Deletes all AI chat sessions for a user, with authorization checks, within a transaction.
 *
 * @param {string} targetUserId - The user ID whose sessions are to be deleted.
 * @param {Object} requestingUser - The authenticated user object making the request.
 * @returns {Promise<Object>} A promise that resolves to an object indicating success.
 * @throws {ApiError} If the user is not authorized or an error occurs during the transaction.
 */
const deleteAllAiSessionsService = async (targetUserId, requestingUser) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // FIX: Added authorization to prevent IDOR. Ensures only the user or an admin can delete all sessions.
    if (!requestingUser) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required.');
    }

    const targetUser = await UserModel.findById(targetUserId).session(session).lean();
    if (!targetUser) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Target user not found.');
    }

    const isOwner = requestingUser._id.toString() === targetUserId;
    const isSuperAdmin = requestingUser.role === 'super_admin';
    // Restrict bulk deletion to admins to prevent accidental mass data loss by managers.
    const isAdminOfSameWorkspace =
      requestingUser.role === 'admin' &&
      targetUser.workspace &&
      requestingUser.workspace &&
      requestingUser.workspace.toString() === targetUser.workspace.toString();

    if (!isOwner && !isSuperAdmin && !isAdminOfSameWorkspace) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to delete all sessions for this user.');
    }

    if (
      !targetUser.llamaAiSessions ||
      !Array.isArray(targetUser.llamaAiSessions) ||
      targetUser.llamaAiSessions.length === 0
    ) {
      await session.commitTransaction();
      session.endSession();
      return {
        statusCode: httpStatus.OK,
        success: true,
        message: 'No AI sessions found for the user to delete.',
      };
    }

    const aiSessionIds = targetUser.llamaAiSessions.map((id) => id.toString());

    await ChatHistory.deleteMany({ _id: { $in: aiSessionIds } }).session(session);

    // Use $set to empty the array, which is cleaner than pulling many items.
    const userUpdateResult = await UserModel.updateOne(
      { _id: targetUserId },
      { $set: { llamaAiSessions: [] } }
    ).session(session);

    if (userUpdateResult.acknowledged) {
      await session.commitTransaction();
      session.endSession();
      return {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All AI sessions and user references deleted successfully',
      };
    } else {
      // This case indicates a potential issue with the DB operation acknowledgment.
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update the user model after deleting sessions.');
    }
  } catch (error) {
    await session.abortTransaction();
    logger.error({
      message: 'An error occurred during deleteAllAiSessionsService execution',
      severity: 'ERROR',
      error: error.message || error,
      stack: error.stack,
      targetUserId,
      requestingUserId: requestingUser?._id,
    });
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred during the deletion process.');
  } finally {
    session.endSession();
  }
};

const getAllAiSessionsForSuperAdminService = async () => {
  try {
    return await ChatHistory.find({}).populate('user', 'email name').lean();
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve all sessions');
  }
};

const getPlatformWideStats = async () => {
  try {
    const totalPromptsResult = await UserModel.aggregate([
      { $group: { _id: null, total: { $sum: '$promptsUsed' } } }
    ]);
    const totalPrompts = totalPromptsResult[0]?.total || 0;
    const uniqueUsers = await UserModel.countDocuments({ promptsUsed: { $gt: 0 } });
    const totalSessions = await ChatHistory.countDocuments({});
    return {
      totalPrompts,
      uniqueUsers,
      totalSessions,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve platform statistics');
  }
};

const adminDeleteOneLlamaAiSessionById = async (objectId) => {
  try {
    const sessionToDelete = await ChatHistory.findById(objectId);
    if (!sessionToDelete) {
      throw new ApiError(httpStatus.NOT_FOUND, 'LlamaAiSession not found');
    }
    const deleteResult = await ChatHistory.deleteOne({ _id: objectId });
    if (deleteResult.deletedCount === 1) {
      if (sessionToDelete.user) {
        await UserModel.updateOne(
          { _id: sessionToDelete.user },
          { $pull: { llamaAiSessions: objectId } }
        );
      }
      return {
        success: true,
        message: 'LlamaAiSession deleted successfully by admin',
      };
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to delete the LlamaAiSession');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal error occurred during deletion');
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
  getAllAiSessionsForSuperAdminService,
  getPlatformWideStats,
  adminDeleteOneLlamaAiSessionById,
};