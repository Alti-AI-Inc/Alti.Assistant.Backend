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
import Llama from './groq.model.js';
import { fetchSearchResults } from './groq.utilities.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';
import { GeminiAiService } from '../gemini/gemini.service.js';

const AnonymousSessionMemoryStore = {}; // Stores session memory for each user session
const MAX_MEMORY_SIZE = 12; // Limits stored messages per session

/**
 * Redirects user-registered Groq completions to Google Gemini 3.1 Flash exclusively
 */
const getAiResponsesGroqService = async (prompt, userId, sessionId) => {
  logger.info(
    `Redirecting Groq completions Request to Google Gemini 3.1 Flash exclusively.`
  );
  return GeminiAiService.geminiService(sessionId, prompt, userId);
};

/**
 * Redirects anonymous search-enhanced Groq completions to Google Gemini 3.1 Flash exclusively
 */
const GroqAiGetResponseAnonymousService = async (
  prompt,
  sessionIdFromClient
) => {
  const sessionId = sessionIdFromClient || randomUUID(); // Unique session ID if not provided

  if (!prompt) {
    throw ApiError(httpStatus.NOT_FOUND, 'Prompt is required.');
  }

  // Enhance prompt using massiveSmartRouter for real-time market data
  const enhancedPrompt = await massiveSmartRouter.combinedRouteAndEnhancePrompt(prompt);

  // Initialize memory if it doesn't exist
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
Answer the user query directly, simply, and concisely. Never include conversational preamble or throat-clearing.
Be extremely concise to maximize response speed.

Previous Conversation:
${previousMessages
  .map((msg) => `${msg._getType().toUpperCase()}: ${msg.text}`)
  .join('\n')}

User Query: ${enhancedPrompt}`;

  // Initialize Google Gemini model
  const client = new GoogleGenerativeAI(config.gemini_secret_key);
  const model = client.getGenerativeModel({ model: 'gemini-3.5-flash' });

  // Add the new user message
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

const getAiResponsesByUserIdService = async (userId) => {
  const sessionData = await UserModel.findOne({
    _id: userId,
  })
    .select('email profile')
    .populate({
      path: 'llamaAiSessions',
    });
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

const getAiResponsesBySession = async (id) => {
  const sessionData = await Llama.findOne({
    sessionId: id,
  });

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

const deleteOneLlamaAiSession = async (objectId) => {
  const userData = await Llama.findOne({
    _id: objectId,
  });
  if (!userData) {
    throw new Error('LlamaAiSession not found');
  }
  const deleteResult = await Llama.deleteOne({
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

const deleteAllAiSessionsService = async (userId) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const user = await UserModel.findById(userId).session(session);
    if (
      !user ||
      !user.llamaAiSessions ||
      !Array.isArray(user.llamaAiSessions)
    ) {
      throw new Error('User or LlamaAiSession data not found');
    }

    const aiSessionIds = user.llamaAiSessions.map((id) => id.toString());

    const deleteResults = await Promise.all(
      aiSessionIds.map((id) => Llama.deleteOne({ _id: id }).session(session))
    );

    const allDeleted = deleteResults.every(
      (result) => result.deletedCount === 1
    );
    if (!allDeleted) {
      throw new Error('Failed to delete one or more AI sessions');
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
      throw new Error('Failed to update the user model');
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

export const LlamaAiService = {
  getAiResponsesGroqService,
  GroqAiGetResponseAnonymousService,
  getAiResponsesByUserIdService,
  getAiResponsesBySession,
  deleteOneLlamaAiSession,
  deleteAllAiSessionsService,
};
