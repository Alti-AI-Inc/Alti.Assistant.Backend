/**
 * @typedef {import('@langchain/core/chat_history').BaseListChatMessageHistory} BaseListChatMessageHistory
 * @typedef {import('@langchain/core/messages').BaseMessage} BaseMessage
 */

import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
// VERTEX_AI_AUDIT: Switched from consumer-grade GenAI to the enterprise Vertex AI SDK for better security, governance, and integration.
import { ChatVertexAI } from '@langchain/google-vertexai';
// VERTEX_AI_AUDIT: Imported enums for explicitly configuring safety settings, a requirement for enterprise-grade applications.
import {
  HarmCategory,
  HarmBlockThreshold,
} from '@google-cloud/vertexai';
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

// VERTEX_AI_AUDIT: Added a PII masking function to prevent sensitive user data from being sent to the model.
// In a production environment, consider using a more robust solution like the Google Cloud DLP API.
const maskPII = text => {
  if (!text) return '';
  // Mask email addresses
  let maskedText = text.replace(
    /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
    '[EMAIL_REDACTED]'
  );
  // Mask phone numbers (basic North American format)
  maskedText = maskedText.replace(
    /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
    '[PHONE_REDACTED]'
  );
  // Mask Social Security Numbers
  maskedText = maskedText.replace(
    /(\d{3}-\d{2}-\d{4})/g,
    '[SSN_REDACTED]'
  );
  return maskedText;
};

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

    // PLATFORM_OWNER_FEATURE: Global service kill switch.
    // Allows the Platform Owner to disable the AI service for all tenants during maintenance or emergencies.
    if (platformConfig?.service?.enabled === false) {
      throw new ApiError(
        httpStatus.SERVICE_UNAVAILABLE,
        'The AI service is temporarily unavailable. Please try again later.'
      );
    }

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
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('Loaded existing chat history from DB.', {
        userId,
        sessionId,
      });
    } else {
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('No existing chat history found. Starting new memory.', {
        userId,
        sessionId,
      });
    }

    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistoryInstance,
    });

    // PLATFORM_OWNER_FEATURE: Use dynamically configured model settings from the database.
    // This allows the Platform Owner to change the AI model or its parameters for all users without a code deployment.
    // Fallback to environment config if no database config is found.
    const modelName = platformConfig?.ai?.defaultModel || config.gemini_model || 'gemini-3.5-flash';
    const modelTemperature = platformConfig?.ai?.temperature ?? 0.7;

    // VERTEX_AI_AUDIT: Instantiating the model using the enterprise ChatVertexAI class.
    // This assumes Application Default Credentials (ADC) are configured in the environment.
    // The 'apiKey' is removed in favor of standard Google Cloud authentication.
    const model = new ChatVertexAI({
      model: modelName,
      temperature: modelTemperature,
      // VERTEX_AI_AUDIT: Explicitly configured Google's safety filters to block harmful content.
      // This is a critical security measure for any application interacting with generative models.
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    const chain = new ConversationChain({ llm: model, memory });

    // VERTEX_AI_AUDIT: Sanitize the user prompt to remove PII before sending it to the AI model.
    const sanitizedPrompt = maskPII(prompt);

    const res1 = await chain.invoke({ input: sanitizedPrompt });
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
        // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
        logger.error('Error in incrementPromptsUsed.', {
          userId,
          errorMessage: error.message,
          errorStack: error.stack,
        });
        if (error instanceof ApiError) {
          throw error;
        }
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'An error occurred while updating prompt usage.'
        );
      }
    } else {
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('Quota check bypassed for super_admin user.', {
        userId,
        sessionId,
      });
    }

    const responseData = {
      prompt, // Storing the original, unmasked prompt in the database for user-facing history.
      model: model.model, // Corrected to access model name from ChatVertexAI instance
      reply,
    };

    if (llamaSession) {
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('Existing session found, updating.', {
        userId,
        sessionId,
      });
      // OPTIMIZATION: Use atomic `updateOne` with `$push` to avoid concurrency issues.
      await ChatHistory.updateOne(
        { _id: llamaSession._id },
        { $push: { responses: responseData } }
      );
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('Updated chat history session.', {
        chatHistoryId: llamaSession._id,
      });
    } else {
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('Creating new chat history session.', {
        userId,
        sessionId,
      });
      const newSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
      logger.info('New chat history session created.', {
        chatHistoryId: newSession._id,
      });

      // OPTIMIZATION: Use `updateOne` instead of `findByIdAndUpdate` as the returned document is not needed.
      await UserModel.updateOne(
        { _id: userId },
        { $push: { llamaAiSessions: newSession._id } }
      );
    }

    const payload = { prompt, sessionId, reply };
    return payload;
  } catch (error) {
    // GCP_LOGGING_AUDIT: Switched to structured JSON logging for better parsing and filtering in Cloud Logging.
    logger.error('Error in Llama4AiGetResponseService.', {
      userId,
      sessionId,
      errorMessage: error.message,
      errorStack: error.stack,
    });
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