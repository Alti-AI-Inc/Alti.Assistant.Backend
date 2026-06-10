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
  // FIX: Removed global `sessionMemoryStore` to prevent memory leaks,
  // ensure scalability across multiple instances, and handle server restarts.
  // Chat history is now loaded from the database for each request.
  let chatHistoryInstance = new InMemoryChatMessageHistory();
  let llamaSession = await ChatHistory.findOne({ user: userId, sessionId });

  if (llamaSession && llamaSession.responses && llamaSession.responses.length > 0) {
    // Reconstruct chat history from database for the current session
    for (const response of llamaSession.responses) {
      await chatHistoryInstance.addMessage(new HumanMessage(response.prompt));
      await chatHistoryInstance.addMessage(new AIMessage(response.reply));
    }
    logger.info('Loaded existing chat history from DB for sessionId:', sessionId);
  } else {
    logger.info('No existing chat history found for sessionId:', sessionId, '. Starting new memory.');
  }

  // Initialize BufferMemory with the (potentially pre-populated) chat history
  const memory = new BufferMemory({
    returnMessages: true,
    memoryKey: 'history',
    chatHistory: chatHistoryInstance,
  });

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    apiKey: config.gemini_secret_key,
  });

  const chain = new ConversationChain({ llm: model, memory });
  // FIX: Avoid logging potentially sensitive full memory object in production.
  // logger.info('Memory Initialized:', memory);

  try {
    // FIX: ConversationChain's `invoke` method internally adds the HumanMessage and AIMessage
    // to the memory it's configured with. Explicitly adding HumanMessage here before invoke
    // would result in a duplicate HumanMessage in the history.
    // Let the chain manage adding messages to its memory.

    // Invoke model
    const res1 = await chain.invoke({ input: prompt });
    // FIX: Avoid logging potentially sensitive full model response in production.
    // logger.info('Model Response:', res1);

    const reply = res1?.response || 'No reply generated';

    // FIX: Improved error propagation for payment usage increment.
    // Ensures specific ApiError (e.g., BAD_REQUEST for quota) is not masked
    // by a generic INTERNAL_SERVER_ERROR.
    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      logger.error('Error in incrementPromptsUsed:', error);
      // If the error is already an ApiError, re-throw it directly.
      // Otherwise, wrap it in a generic INTERNAL_SERVER_ERROR.
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    // FIX: ConversationChain's `invoke` method internally adds the AI response
    // to the memory it's configured with. The `chatHistoryInstance` (which is `memory.chatHistory`)
    // will already contain the latest messages after `chain.invoke`.

    // Save response in the database
    const responseData = {
      prompt,
      // FIX: Model name mismatch. Use the actual model name from the LLM instance.
      model: model.modelName,
      reply,
      // FIX: `ConversationChain.invoke` does not typically provide a `usage.total_time` property.
      // Removed to avoid storing misleading data. If needed, manual timing should be implemented.
      // total_time: res1?.usage?.total_time || 0,
    };

    // Optimization Recommendation: For faster lookups on ChatHistory, ensure an index exists on the schema.
    // Example: ChatHistorySchema.index({ user: 1, sessionId: 1 });
    // `llamaSession` was already fetched at the beginning of the function.

    if (llamaSession) {
      logger.info('Existing Session Found, updating:', llamaSession._id);
      // FIX: Removed redundant optional chaining. Assuming 'responses' is always an array
      // based on schema design for `ChatHistory`.
      llamaSession.responses.push(responseData);
      await llamaSession.save();
      logger.info('Updated Session:', llamaSession._id);
    } else {
      logger.info('Creating New Session...');
      llamaSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      logger.info('New Session Created:', llamaSession._id);
      await UserModel.findByIdAndUpdate(userId, {
        $push: { llamaAiSessions: llamaSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
    // FIX: Removed debug console.log.
    // console.log('Payloadddddddddddddddd:', payload);
    return payload;
  } catch (error) {
    logger.error('Error in Llama4AiGetResponseService:', error);
    // FIX: Re-throw specific ApiError if it originated from inner blocks (e.g., payment),
    // to avoid masking specific errors as generic 'AI service failed.'.
    if (error instanceof ApiError) {
      throw error;
    }
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