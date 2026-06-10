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
  // Fetch user to validate hierarchy, roles, and tenant boundaries
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }

  // Role Validation
  const allowedRoles = ['super_admin', 'admin', 'manager', 'user'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: Invalid or unauthorized role.');
  }

  // Tenant Context Boundary Validation
  // Super admins have global access; other roles must belong to a valid tenant/workspace context
  if (user.role !== 'super_admin' && !user.tenantId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied: No tenant context associated with this user.');
  }

  // Check and propagate usage limits up the hierarchy before processing the request
  if (user.role === 'user' || user.role === 'manager') {
    // Check user-specific limits
    if (user.usageLimit && user.promptsUsed >= user.usageLimit) {
      logger.warn(`Usage limit exceeded for user ${userId}.`);
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Your individual usage limit has been reached. Please contact your manager.');
    }

    // Check manager/team limits if applicable
    if (user.managerId) {
      const manager = await UserModel.findById(user.managerId);
      if (manager && manager.teamUsageLimit && manager.teamPromptsUsed >= manager.teamUsageLimit) {
        logger.warn(`Team usage limit exceeded for manager ${user.managerId}.`);
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Your team\'s usage limit has been reached. Please contact your administrator.');
      }
    }
  }

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

  try {
    // Invoke model
    const res1 = await chain.invoke({ input: prompt });
    const reply = res1?.response || 'No reply generated';

    // Improved error propagation for payment usage increment and hierarchy propagation.
    try {
      const paymentResult = await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }

      // Propagate usage details up the hierarchy
      // 1. Update user's prompt count
      await UserModel.findByIdAndUpdate(userId, { $inc: { promptsUsed: 1 } });

      // 2. Propagate to Manager
      if (user.managerId) {
        await UserModel.findByIdAndUpdate(user.managerId, { 
          $inc: { teamPromptsUsed: 1 } 
        });
        logger.info(`Propagated usage increment to manager: ${user.managerId}`);
      }

      // 3. Propagate to Tenant Admin / Workspace Owner
      if (user.tenantId) {
        const tenantAdmin = await UserModel.findOne({ tenantId: user.tenantId, role: 'admin' });
        if (tenantAdmin) {
          await UserModel.findByIdAndUpdate(tenantAdmin._id, {
            $inc: { tenantPromptsUsed: 1 }
          });
          logger.info(`Propagated usage increment to tenant admin: ${tenantAdmin._id}`);
        }
      }

    } catch (error) {
      logger.error('Error in incrementPromptsUsed or hierarchy propagation:', error);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    // Save response in the database
    const responseData = {
      prompt,
      model: model.modelName,
      reply,
    };

    if (llamaSession) {
      logger.info('Existing Session Found, updating:', llamaSession._id);
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

    return { prompt, sessionId, reply };
  } catch (error) {
    logger.error('Error in Llama4AiGetResponseService:', error);
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