/**
 * @typedef {import('@langchain/core/chat_history').BaseListChatMessageHistory} BaseListChatMessageHistory
 * @typedef {import('@langchain/core/messages').BaseMessage} BaseMessage
 */

import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import httpStatus from 'http-status';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';

/**
 * @typedef {Object} SessionMemory
 * @property {BufferMemory} memory - The BufferMemory instance for the session.
 */

/**
 * Stores session memory for each user session.
 * The key is the sessionId, and the value is a BufferMemory instance.
 * @type {Record<string, BufferMemory>}
 */
const sessionMemoryStore = {}; // Stores session memory for each user session

/**
 * Handles the AI interaction for Llama4, processes user prompts,
 * manages conversation history, updates payment usage, and persists chat data.
 *
 * @async
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @param {string} sessionId - The unique ID for the current conversation session.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, session ID, and the AI's reply.
 * @throws {ApiError} If there's an issue with payment usage increment,
 *                     an internal server error during AI processing, or database operations.
 */
const Llama4AiGetResponseService = async (prompt, userId, sessionId) => {
  // Initialize session memory for conversation history
  let memory = sessionMemoryStore[sessionId];
  if (!memory) {
    memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: new InMemoryChatMessageHistory(),
    });
    sessionMemoryStore[sessionId] = memory;
  }

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    apiKey: config.gemini_secret_key,
  });

  const chain = new ConversationChain({ llm: model, memory });
  logger.info('Memory Initialized:', memory);

  try {
    // Store user message in chat history
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Invoke model
    const res1 = await chain.invoke({ input: prompt });
    logger.info('Model Response:', res1);

    const reply = res1?.response || 'No reply generated';

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

    // Store AI response in chat history
    await memory.chatHistory.addMessage(new AIMessage(reply));

    // Save response in the database
    const responseData = {
      prompt,
      model: 'llama3-8b-8192',
      reply,
      total_time: res1?.usage?.total_time || 0,
    };

    // Optimization Recommendation: For faster lookups on ChatHistory, ensure an index exists on the schema.
    // Example: ChatHistorySchema.index({ user: 1, sessionId: 1 });
    let llamaSession = await ChatHistory.findOne({ user: userId, sessionId });

    if (llamaSession) {
      logger.info('Existing Session Found:', llamaSession);
      llamaSession?.responses?.push(responseData);
      await llamaSession.save();
      logger.info('Updated Session:', llamaSession);
    } else {
      logger.info('Creating New Session...');
      llamaSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      logger.info('New Session Created:', llamaSession);
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: llamaSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
    console.log('Payloadddddddddddddddd:', payload);
    return payload;
  } catch (error) {
    logger.error('Error in Llama4AiGetResponseService:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

/**
 * Provides a collection of Llama4 AI related services.
 * @namespace Llama4AiServices
 */
export const Llama4AiServices = {
  Llama4AiGetResponseService,
};