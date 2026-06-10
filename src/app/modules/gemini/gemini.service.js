/**
 * @file This file provides services for interacting with the Google Gemini AI model,
 * managing chat history, tracking prompt usage, and persisting conversation data.
 * It integrates with various internal modules for enhanced functionality like
 * prompt routing and payment processing.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
import { paymentController } from '../payment/payment.controller.js';
import { GEMINI_RESPONSE_SERVICE_POST } from './gemini.constant.js';
import { RedisClient } from '../../../shared/redis.js';
import { UnifiedSmartRouter } from '../../helpers/UnifiedSmartRouter.js';

/**
 * Initializes the Google Generative AI client with the configured API key.
 * @type {GoogleGenerativeAI}
 */
const client = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Configures the primary Gemini AI model for content generation.
 * Uses 'gemini-2.5-flash' with a low temperature for more deterministic responses.
 * @type {import('@google/generative-ai').GenerativeModel}
 */
const model = client.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { temperature: 0.1 },
});

/**
 * Handles the core interaction with the Gemini AI model, manages chat history,
 * tracks prompt usage, and persists conversation data for a given session and user.
 * This internal helper function centralizes logic for both primary and preview services,
 * ensuring consistent behavior and avoiding code duplication.
 *
 * @private
 * @async
 * @function _handleGeminiInteraction
 * @security User-Scoped Isolation: This operation is strictly isolated to the provided `userId`.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation (used for multi-tenant/user data isolation).
 * @param {import('@google/generative-ai').GenerativeModel} modelToUse - The Gemini model instance to use for generation.
 * @param {boolean} shouldPublishToRedis - Flag to determine if the response should be published to Redis.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const _handleGeminiInteraction = async (
  sessionId,
  prompt,
  userId,
  modelToUse,
  shouldPublishToRedis
) => {
  try {
    // 1. Fetch user and validate hierarchy, roles, and tenant context boundaries
    // Optimization: Use .select() to fetch only necessary fields and .lean() for a faster, plain JavaScript object.
    const user = await UserModel.findById(userId)
      .select('role tenantId promptLimit promptsUsed managerId')
      .lean();

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Validate role hierarchy
    const validRoles = ['super_admin', 'admin', 'manager', 'user'];
    if (!user.role || !validRoles.includes(user.role)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Unauthorized role or invalid role configuration');
    }

    // Validate tenant context boundary (except for platform-wide super_admin)
    if (user.role !== 'super_admin' && !user.tenantId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'User is not associated with any tenant/workspace context');
    }

    // Check individual user limits
    if (user.promptLimit !== undefined && user.promptsUsed >= user.promptLimit) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'User prompt limit exceeded');
    }

    // Check tenant-wide limits if applicable
    if (user.tenantId && user.role !== 'super_admin') {
      // Optimization: Fetch only required fields using .select() and use .lean() for a read-only, faster query.
      // Recommendation: Create a compound index on { tenantId: 1, role: 1 } in the 'users' collection for performance.
      const tenantAdmin = await UserModel.findOne({
        tenantId: user.tenantId,
        role: 'admin',
      })
        .select('tenantLimit tenantUsage')
        .lean();

      if (tenantAdmin && tenantAdmin.tenantLimit !== undefined && tenantAdmin.tenantUsage >= tenantAdmin.tenantLimit) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Workspace/Tenant limit exceeded');
      }
    }

    // Dynamically load chat history from the database for the current session.
    // Optimization: Fetch only the 'responses' field and use .lean() as we only need to read the data.
    // Recommendation: Create a compound index on { user: 1, sessionId: 1 } in the 'chathistories' collection for both reads and writes.
    const existingChatHistoryDoc = await ChatHistory.findOne({
      user: userId,
      sessionId,
    })
      .select('responses')
      .lean();

    const chatHistory = new InMemoryChatMessageHistory();
    if (existingChatHistoryDoc && existingChatHistoryDoc.responses) {
      for (const response of existingChatHistoryDoc.responses) {
        chatHistory.addMessage(new HumanMessage(response.prompt));
        chatHistory.addMessage(new AIMessage(response.reply));
      }
    }

    const memory = new BufferMemory({
      returnMessages: true,
      memoryKey: 'history',
      chatHistory: chatHistory,
    });

    // Enhance prompt using UnifiedSmartRouter for real-time market data
    const enhancedPrompt =
      await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(prompt);

    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Gemini AI to generate a response
    const result = await modelToUse.generateContent(enhancedPrompt);
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No reply generated';

    // Handle prompt usage increment and potential payment issues
    try {
      const paymentResult =
        await paymentController.incrementPromptsUsed(userId);

      if (!paymentResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, paymentResult.message);
      }
    } catch (error) {
      // GCP-compatible structured logging
      logger.error({
        message: 'Failed to increment prompt usage',
        severity: 'ERROR',
        userId,
        sessionId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'An error occurred while updating prompt usage.'
      );
    }

    // Propagate usage details, limits, and notifications up the hierarchy
    const propagationPromises = [];

    // Propagate to Manager
    if (user.managerId) {
      // Note: findByIdAndUpdate is efficient as it uses the primary _id index.
      propagationPromises.push(
        UserModel.findByIdAndUpdate(user.managerId, {
          $inc: { managedUsageCount: 1 }
        })
      );
      // GCP-compatible structured logging
      logger.info({
        message: 'Usage propagated to Manager',
        severity: 'INFO',
        userId,
        managerId: user.managerId,
      });
    }

    // Propagate to Tenant Administrator / Workspace Owner
    if (user.tenantId) {
      // Recommendation: Ensure an index exists on { tenantId: 1, role: 1 } for this update operation.
      propagationPromises.push(
        UserModel.updateMany(
          { tenantId: user.tenantId, role: 'admin' },
          { $inc: { tenantUsageCount: 1 } }
        )
      );
      // GCP-compatible structured logging
      logger.info({
        message: 'Usage propagated to Tenant Admins',
        severity: 'INFO',
        userId,
        tenantId: user.tenantId,
      });
    }

    // Propagate to Super Admin / Platform Owner
    // Recommendation: Ensure an index exists on { role: 1 } for this update operation.
    propagationPromises.push(
      UserModel.updateMany(
        { role: 'super_admin' },
        { $inc: { platformUsageCount: 1 } }
      )
    );

    // Execute propagation concurrently
    await Promise.all(propagationPromises);

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: 'gemini-2.5-flash',
      reply,
      total_time: result?.usage?.total_time || 0,
    };

    // Note: The index on { user: 1, sessionId: 1 } recommended earlier also optimizes this update.
    const updateResult = await ChatHistory.updateOne(
      { user: userId, sessionId },
      { $push: { responses: responseData } }
    );

    if (updateResult.modifiedCount === 0) {
      const newGeminiSession = await ChatHistory.create({
        user: userId,
        sessionId,
        responses: [responseData],
      });
      // Note: findByIdAndUpdate is efficient as it uses the primary _id index.
      await UserModel.findByIdAndUpdate(userId, {
        $push: { geminiAiSessions: newGeminiSession._id },
      });
    }

    const payload = { prompt, sessionId, reply };
    if (shouldPublishToRedis && payload) {
      await RedisClient.publish(
        GEMINI_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }
    return payload;
  } catch (err) {
    // GCP-compatible structured logging
    logger.error({
      message: 'An unhandled error occurred in the Gemini service interaction.',
      severity: 'ERROR',
      userId,
      sessionId,
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
    });
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Gemini Service failed'
    );
  }
};

/**
 * Processes a user's prompt through the primary Gemini AI model.
 * This service orchestrates the entire lifecycle of a user interaction:
 * 1. Validates user permissions, roles, and usage limits (both individual and tenant-wide).
 * 2. Retrieves and manages the conversation history for the given session.
 * 3. Enhances the prompt with real-time data via the `UnifiedSmartRouter`.
 * 4. Generates a response from the Gemini model.
 * 5. Increments user and tenant prompt usage counters.
 * 6. Persists the new prompt and reply to the database.
 * 7. Publishes the final response to a Redis channel for real-time updates.
 *
 * @async
 * @function geminiService
 * @security User-Scoped Isolation: Access is restricted to the authenticated user matching `userId`.
 *           Enforces role-based permissions and multi-tenant context boundaries.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} Throws an `ApiError` for issues like user not found, permission denied,
 *                    usage limit exceeded, or internal failures in AI generation or database operations.
 */
const geminiService = async (sessionId, prompt, userId) => {
  return _handleGeminiInteraction(sessionId, prompt, userId, model, true);
};

/**
 * Processes a user's prompt through a Gemini AI model for preview or alternative purposes.
 * This service follows the same logic as `geminiService` (permission checks, history management,
 * usage tracking, and persistence) but with one key difference: it **does not** publish the
 * final response to the Redis channel. This makes it suitable for scenarios where real-time
 * broadcasting is not required.
 *
 * @async
 * @function gemini25PreviewService
 * @security User-Scoped Isolation: Access is restricted to the authenticated user matching `userId`.
 *           Enforces role-based permissions and multi-tenant context boundaries.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} Throws an `ApiError` for issues like user not found, permission denied,
 *                    usage limit exceeded, or internal failures in AI generation or database operations.
 */
const gemini25PreviewService = async (sessionId, prompt, userId) => {
  return _handleGeminiInteraction(sessionId, prompt, userId, model, false);
};

/**
 * A collection of services for interacting with the Google Gemini AI.
 * This includes the primary service for standard chat interactions and
 * specialized services for different use cases like previews.
 * @namespace GeminiAiService
 */
export const GeminiAiService = {
  geminiService,
  gemini25PreviewService,
};