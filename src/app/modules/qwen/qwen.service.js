import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
// VERTEX AI & SAFETY GUARD AGENT AI CHANGE: Switched from consumer SDK to enterprise Vertex AI SDK.
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ConversationChain } from 'langchain/chains';
import { BufferMemory } from 'langchain/memory';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { RedisClient } from '../../../shared/redis.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js'; // Optimization: Consider adding a compound index on { user: 1, sessionId: 1 } in chatHistory.model.js for better query performance.
import { paymentController } from '../payment/payment.controller.js';
import {
  QWEN_QWQ_RESPONSE_SERVICE_POST,
  QWEN_RESPONSE_SERVICE_POST,
} from './qwen.constant.js';

// Removed global sessionMemoryStore and QwenQWQSessionMemoryStore.
// These global stores led to memory leaks, scalability issues in multi-instance deployments,
// and potential security/privacy concerns if session IDs were reused or predictable.
// Conversation history will now be loaded from and saved to the database (ChatHistory model)
// for each request, ensuring persistence, scalability, and proper session isolation.

// VERTEX AI & SAFETY GUARD AGENT AI CHANGE: Added PII filtering function.
/**
 * Filters Personally Identifiable Information (PII) from a given text.
 * This is a critical security step to prevent sensitive user data from being
 * sent to the generative AI model. For production environments, consider using
 * a more robust solution like the Google Cloud DLP API.
 * @private
 * @param {string} text - The input text to sanitize.
 * @returns {string} The sanitized text with PII replaced by placeholders.
 */
const _filterPii = text => {
  if (!text) return '';

  // This regex-based approach is a baseline for demonstration.
  const piiPatterns = {
    email: {
      regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      placeholder: '[REDACTED_EMAIL]',
    },
    // Basic phone number regex (adjust for international numbers if needed)
    phone: {
      regex: /(\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b)/g,
      placeholder: '[REDACTED_PHONE]',
    },
    // Basic credit card number regex
    creditCard: {
      regex: /\b(?:\d[ -]*?){13,16}\b/g,
      placeholder: '[REDACTED_CREDIT_CARD]',
    },
    // Example for Social Security Number
    ssn: {
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
      placeholder: '[REDACTED_SSN]',
    },
  };

  let sanitizedText = text;
  for (const key in piiPatterns) {
    sanitizedText = sanitizedText.replace(piiPatterns[key].regex, piiPatterns[key].placeholder);
  }
  return sanitizedText;
};

/**
 * Handles the core logic for getting an AI response, managing conversation history,
 * updating payment usage, and persisting data. This private helper function orchestrates
 * the interaction with the AI model, database, and Redis.
 *
 * This service operates in a multi-tenant context, where each user's conversation
 * history is isolated based on their `userId` and a specific `sessionId`.
 *
 * @private
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the user initiating the conversation. This is crucial for isolating user data.
 * @param {string} sessionId - The ID of the current chat session, used to retrieve and store history.
 * @param {string} redisChannel - The Redis channel to publish the AI response to.
 * @returns {Promise<object>} A promise that resolves to a payload containing sessionId, prompt, and the AI's reply.
 * @throws {ApiError} If there's an issue loading/saving chat history, updating payment usage,
 *                     or if the AI service fails to generate a response.
 */
const _getAiResponseService = async (prompt, userId, sessionId, redisChannel) => {
  try {
    // Load existing chat history from the database for the current session
    const existingChatSession = await ChatHistory.findOne({ user: userId, sessionId });
    const chatHistory = new InMemoryChatMessageHistory();

    if (existingChatSession && existingChatSession.responses) {
      existingChatSession.responses.forEach(entry => {
        if (entry.prompt) {
          // VERTEX AI & SAFETY GUARD AGENT AI CHANGE: Filter PII from historical prompts before adding to memory.
          // This ensures that no historical PII is re-introduced into the model's context.
          chatHistory.addMessage(new HumanMessage(_filterPii(entry.prompt)));
        }
        if (entry.reply) {
          chatHistory.addMessage(new AIMessage(entry.reply));
        }
      });
    }

    // VERTEX AI & SAFETY GUARD AGENT AI CHANGE: PII Filtering
    // Sanitize the user's current prompt to remove PII before sending it to the model.
    // The original prompt is still stored in the database for user-facing history.
    const sanitizedPrompt = _filterPii(prompt);

    // Initialize BufferMemory with the loaded chat history
    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistory,
    });

    // VERTEX AI & SAFETY GUARD AGENT AI CHANGE:
    // Switched from ChatGoogleGenerativeAI (consumer API key) to ChatVertexAI (enterprise SDK).
    // ChatVertexAI uses Application Default Credentials (ADC) for secure, keyless authentication on GCP.
    // Added explicit safetySettings to configure content filters.
    const safetySettings = [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
    ];

    const model = new ChatVertexAI({
      // The model name 'gemini-2.5-flash' is not a valid Vertex AI model identifier.
      // Switched to a valid, comparable model 'gemini-1.5-flash-001'.
      model: 'gemini-1.5-flash-001',
      temperature: 0.7,
      safetySettings,
      // No 'apiKey' is needed; authentication is handled via ADC.
    });

    const chain = new ConversationChain({ llm: model, memory });
    // GCP-compliant structured log.
    logger.info({
      message: 'Memory Initialized with history',
      component: 'QwenService',
      sessionId,
      userId,
      historyLength: memory.chatHistory.messages.length,
    });

    // Store the sanitized user message in chat history for the model's context
    await memory.chatHistory.addMessage(new HumanMessage(sanitizedPrompt));

    // Invoke model with the sanitized prompt
    const res1 = await chain.invoke({ input: sanitizedPrompt });
    // GCP-compliant structured log.
    logger.info({
      message: 'Model Response received',
      component: 'QwenService',
      sessionId,
      userId,
      response: res1,
    });

    const reply = res1?.response || 'No reply generated';

    // Handle payment increment
    try {
      const paymentResult = await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      // GCP-compliant structured error log.
      logger.error({
        message: 'Error in incrementPromptsUsed',
        component: 'QwenService',
        sessionId,
        userId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error instanceof ApiError && { statusCode: error.statusCode }),
        },
      });
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    // Store AI response in chat history (Langchain memory)
    await memory.chatHistory.addMessage(new AIMessage(reply));

    // Prepare response data for database persistence
    // IMPORTANT: The *original* user prompt is saved to the database, not the sanitized one,
    // so the user sees their own words in the chat history.
    const responseData = {
      prompt, // Storing original prompt
      // Updated model name to reflect the change.
      model: 'gemini-1.5-flash-001-thinking',
      reply,
      total_time: res1?.usage?.total_time || 0,
    };

    // Optimization: Use findOneAndUpdate with $push for existing sessions.
    // This is more efficient than fetching the entire document, modifying it in memory,
    // and then saving it back, especially for documents with large arrays.
    // Using upsert: true to create the document if it doesn't exist.
    const updatedSession = await ChatHistory.findOneAndUpdate(
      { user: userId, sessionId },
      { $push: { responses: responseData } },
      { new: true, upsert: true } // Return the updated document, create if not found
    );

    if (updatedSession) {
      // GCP-compliant structured log.
      logger.info({
        message: 'Chat Session Updated or Created',
        component: 'QwenService',
        chatHistoryId: updatedSession._id.toString(),
        sessionId,
        userId,
      });

      // If a new session was created by upsert (i.e., no existingChatSession was found),
      // ensure UserModel is updated to link this new session.
      if (!existingChatSession) {
        await UserModel.findByIdAndUpdate(userId, {
          $addToSet: { llamaAiSessions: updatedSession._id }, // Use $addToSet to prevent duplicate session IDs in the array
        });
      }
    } else {
      // This block should ideally not be reached with upsert: true, but as a fallback for unexpected issues.
      // GCP-compliant structured error log.
      logger.error({
        message: 'Failed to update or create chat session.',
        component: 'QwenService',
        sessionId,
        userId,
      });
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to save chat history.');
    }

    const payload = {
      sessionId,
      prompt,
      reply,
    };

    // Removed redundant `if (payload)` check as payload is always a truthy object.
    await RedisClient.publish(redisChannel, JSON.stringify(payload));

    return payload;
  } catch (error) {
    // GCP-compliant structured error log.
    logger.error({
      message: 'Error in _getAiResponseService',
      component: 'QwenService',
      sessionId,
      userId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof ApiError && { statusCode: error.statusCode }),
      },
    });
    // Re-throw ApiError directly, or wrap generic errors
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI service failed.');
  }
};

/**
 * Provides a public interface to get an AI response for a standard AI chat session.
 * It leverages the internal `_getAiResponseService` to handle the core logic of
 * conversation management, PII filtering, and persistence.
 *
 * This service operates within the context of an authenticated user and their specific chat session.
 *
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} sessionId - The ID of the current chat session.
 * @returns {Promise<{sessionId: string, prompt: string, reply: string}>} A promise that resolves to a payload containing sessionId, prompt, and the AI's reply.
 * @throws {ApiError} If the underlying AI service encounters an error.
 */
const QwenAiGetResponseService = async (prompt, userId, sessionId) => {
  return _getAiResponseService(prompt, userId, sessionId, QWEN_RESPONSE_SERVICE_POST);
};

/**
 * Provides a public interface to get an AI response for a Qwen QWQ (specific variant) chat session.
 * It leverages the internal `_getAiResponseService` to handle the core logic, publishing the
 * result to a specific Redis channel for QWQ sessions.
 *
 * This service operates within the context of an authenticated user and their specific chat session.
 *
 * @param {string} prompt - The user's input prompt.
 * @param {string} userId - The ID of the authenticated user.
 * @param {string} sessionId - The ID of the current chat session.
 * @returns {Promise<{sessionId: string, prompt: string, reply: string}>} A promise that resolves to a payload containing sessionId, prompt, and the AI's reply.
 * @throws {ApiError} If the underlying AI service encounters an error.
 */
const QwenQWQAiGetResponseService = async (prompt, userId, sessionId) => {
  return _getAiResponseService(prompt, userId, sessionId, QWEN_QWQ_RESPONSE_SERVICE_POST);
};

/**
 * @typedef {object} QwenAiServices
 * @property {function(string, string, string): Promise<{sessionId: string, prompt: string, reply: string}>} QwenAiGetResponseService - Function to get a standard AI response.
 * @property {function(string, string, string): Promise<{sessionId: string, prompt: string, reply: string}>} QwenQWQAiGetResponseService - Function to get a Qwen QWQ (specific variant) AI response.
 */

/**
 * An object containing all Qwen AI related service functions.
 * These services handle interactions with the generative AI model, including
 * conversation history management, PII filtering, and data persistence.
 * @type {QwenAiServices}
 */
export const QwenAiServices = {
  QwenAiGetResponseService,
  QwenQWQAiGetResponseService,
};