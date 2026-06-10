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
// PLATFORM_OWNER_FEATURE: Import platform-wide configuration model to enable dynamic, global settings management.
import PlatformConfig from '../platform/platformConfig.model.js';

/**
 * Handles the AI interaction for Llama4, processes user prompts,
 * manages conversation history, updates payment usage, and persists chat data.
 * This service includes Platform Owner features for user/tenant management and global configuration.
 *
 * @async
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @param {string} sessionId - The unique ID for the current conversation session.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, session ID, and the AI's reply.
 * @throws {ApiError} If the user is not found, suspended, exceeds their quota,
 *                     or if an internal server error occurs.
 */
const Llama4AiGetResponseService = async (prompt, userId, sessionId) => {
  // A single try...catch block wraps the entire service function to ensure all async operations
  // and potential errors are caught, logged, and handled gracefully.
  try {
    // PLATFORM_OWNER_FEATURE: Fetch user details and global platform configuration concurrently for efficiency.
    // This allows checking user status, role for overrides, and applying dynamic system-wide settings.
    const [user, platformConfig] = await Promise.all([
      UserModel.findById(userId).select('status role').lean(),
      PlatformConfig.findOne({}).lean(), // Assuming a singleton document for platform settings.
    ]);

    // PLATFORM_OWNER_FEATURE: Enforce tenant/user suspension.
    // A Platform Owner can suspend a user, and this check ensures they cannot use the service.
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
    }
    if (user.status === 'suspended') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Your account is suspended. Please contact support.'
      );
    }

    let chatHistoryInstance = new InMemoryChatMessageHistory();

    // OPTIMIZATION: Added `.lean()` to avoid Mongoose document instantiation overhead.
    // Ensure an index exists on the schema: ChatHistorySchema.index({ user: 1, sessionId: 1 });
    let llamaSession = await ChatHistory.findOne({
      user: userId,
      sessionId,
    }).lean();

    if (
      llamaSession &&
      llamaSession.responses &&
      llamaSession.responses.length > 0
    ) {
      // OPTIMIZATION: Batch add messages to memory instead of awaiting in a sequential loop.
      const messages = [];
      for (const response of llamaSession.responses) {
        messages.push(new HumanMessage(response.prompt));
        messages.push(new AIMessage(response.reply));
      }
      await chatHistoryInstance.addMessages(messages);
      // PLATFORM_OWNER_LOGGING: Enhanced logging with user and session context for global oversight.
      logger.info(
        `Loaded existing chat history from DB for user: ${userId}, sessionId: ${sessionId}`
      );
    } else {
      logger.info(
        `No existing chat history found for user: ${userId}, sessionId: ${sessionId}. Starting new memory.`
      );
    }

    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistoryInstance,
    });

    // PLATFORM_OWNER_FEATURE: Use dynamically configured model settings from the database.
    // This allows the Platform Owner to change the AI model or its parameters for all users without a code deployment.
    // Fallback to environment config if no database config is found.
    const modelName = platformConfig?.ai?.defaultModel || 'gemini-2.5-flash';
    const modelTemperature = platformConfig?.ai?.temperature ?? 0.7;

    const model = new ChatGoogleGenerativeAI({
      model: modelName,
      temperature: modelTemperature,
      apiKey: config.gemini_secret_key,
    });

    const chain = new ConversationChain({ llm: model, memory });

    const res1 = await chain.invoke({ input: prompt });
    const reply = res1?.response || 'No reply generated';

    // PLATFORM_OWNER_FEATURE: Implement quota override for Super Admins.
    // This allows platform owners/admins to test, debug, or use the system without consuming tenant/user quotas.
    if (user.role !== 'super_admin') {
      try {
        const paymentResult =
          await paymentController.incrementPromptsUsed(userId);

        if (!paymentResult.success) {
          throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
        }
      } catch (error) {
        // PLATFORM_OWNER_LOGGING: Enhanced error logging with user context.
        logger.error(
          `Error in incrementPromptsUsed for userId: ${userId}`,
          error
        );
        if (error instanceof ApiError) {
          throw error;
        }
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'An error occurred while updating prompt usage.'
        );
      }
    } else {
      // PLATFORM_OWNER_LOGGING: Log when an admin action bypasses the quota system for audit purposes.
      logger.info(
        `Quota check bypassed for super_admin user: ${userId} in session: ${sessionId}`
      );
    }

    const responseData = {
      prompt,
      model: model.modelName,
      reply,
    };

    if (llamaSession) {
      // PLATFORM_OWNER_LOGGING: Add user context to logs for better global oversight.
      logger.info(
        `Existing Session Found, updating for user: ${userId}, session: ${sessionId}`
      );
      // OPTIMIZATION: Use atomic `updateOne` with `$push` to avoid concurrency issues.
      await ChatHistory.updateOne(
        { _id: llamaSession._id },
        { $push: { responses: responseData } }
      );
      logger.info(`Updated Session: ${llamaSession._id}`);
    } else {
      // PLATFORM_OWNER_LOGGING: Add user context to logs.
      logger.info(
        `Creating New Session for user: ${userId}, session: ${sessionId}`
      );
      const newSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      logger.info(`New Session Created: ${newSession._id}`);

      // OPTIMIZATION: Use `updateOne` instead of `findByIdAndUpdate` as the returned document is not needed.
      await UserModel.updateOne(
        { _id: userId },
        { $push: { llamaAiSessions: newSession._id } }
      );
    }

    const payload = { prompt, sessionId, reply };
    return payload;
  } catch (error) {
    // PLATFORM_OWNER_LOGGING: Ensure all major errors are logged with user and session context.
    logger.error(
      `Error in Llama4AiGetResponseService for user: ${userId}, session: ${sessionId}`,
      error
    );
    if (error instanceof ApiError) {
      throw error; // Re-throw controlled, client-safe errors.
    }
    // For unexpected errors, throw a generic internal server error to avoid leaking implementation details.
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