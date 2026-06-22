/**
 * @file This file provides services for interacting with the Google Gemini AI model,
 * managing chat history, tracking prompt usage, and persisting conversation data.
 * It integrates with various internal modules for enhanced functionality like
 * prompt routing and payment processing.
 */

// VERTEX AI SDK CHANGE: Switched from '@google/generative-ai' to the enterprise-grade '@google-cloud/vertexai' SDK.
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google-cloud/vertexai';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import httpStatus from 'http-status';
import { BufferMemory } from 'langchain/memory';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';
// import { paymentController } from '../payment/payment.controller.js'; // Refactored to handle usage atomically within this service
import { GEMINI_RESPONSE_SERVICE_POST } from './gemini.constant.js';
import { RedisClient } from '../../../shared/redis.js';
import { UnifiedSmartRouter } from '../../helpers/UnifiedSmartRouter.js';

/**
 * Initializes the Vertex AI client with project and location details.
 * @type {VertexAI}
 */
const vertex_ai = new VertexAI({
  project: config.gcp.project_id,
  location: config.gcp.location,
});

// SAFETY SETTINGS: Explicitly configure safety filters for the model.
// This blocks content with a high probability of being hate speech or harassment.
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

/**
 * Configures the primary Gemini AI model for content generation via Vertex AI.
 * PLATFORM OWNER FEATURE: Model name, temperature, and service status are sourced from the global config,
 * allowing system-wide changes without code deployment.
 * @type {import('@google-cloud/vertexai').GenerativeModel}
 */
const model = vertex_ai.getGenerativeModel({
  model: config.gemini.model_name || config.gemini_model || 'gemini-3.5-flash', // Fallback to a default Vertex AI model
  generationConfig: { temperature: config.gemini.temperature || 0.2 }, // Fallback to a default temperature
  // SAFETY SETTINGS: Applying the defined safety filters to the model instance.
  safetySettings,
});

/**
 * Filters common Personally Identifiable Information (PII) from a given text.
 * This is a basic implementation. For production, consider using a more robust
 * solution like the Google Cloud Data Loss Prevention (DLP) API.
 * @private
 * @param {string} text - The input text to sanitize.
 * @returns {string} The text with PII masked.
 */
const _filterPII = text => {
  if (!text) return '';
  // Regex for email addresses
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
  // Regex for common phone number formats
  const phoneRegex =
    /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g;
  // Regex for basic credit card numbers (Luhn check not included)
  const ccRegex = /\b(?:\d[ -]*?){13,16}\b/g;

  return text
    .replace(emailRegex, '[EMAIL_REDACTED]')
    .replace(phoneRegex, '[PHONE_REDACTED]')
    .replace(ccRegex, '[CREDIT_CARD_REDACTED]');
};

/**
 * Handles the core interaction with the Gemini AI model, manages chat history,
 * tracks prompt usage, and persists conversation data for a given session and user.
 * This internal helper function centralizes logic for both primary and preview services,
 * ensuring consistent behavior and avoiding code duplication.
 *
 * @private
 * @security User-Scoped Isolation: This operation is strictly isolated to the provided `userId`.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation (used for multi-tenant/user data isolation).
 * @param {import('@google-cloud/vertexai').GenerativeModel} modelToUse - The Gemini model instance to use for generation.
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

    // PLATFORM OWNER FEATURE: Global service enable/disable switch (kill switch).
    // Allows disabling the AI service for all non-super_admin users during maintenance or emergencies.
    // This is controlled via the 'config.gemini.service_enabled' environment variable.
    if (
      config.gemini.service_enabled === false &&
      user.role !== 'super_admin'
    ) {
      throw new ApiError(
        httpStatus.SERVICE_UNAVAILABLE,
        'The AI service is temporarily unavailable. Please try again later.'
      );
    }

    // Validate role hierarchy
    const validRoles = ['super_admin', 'admin', 'manager', 'user'];
    if (!user.role || !validRoles.includes(user.role)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Unauthorized role or invalid role configuration'
      );
    }

    // Validate tenant context boundary (except for platform-wide super_admin)
    if (user.role !== 'super_admin' && !user.tenantId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'User is not associated with any tenant/workspace context'
      );
    }

    // PLATFORM OWNER OVERSIGHT: Log when a super_admin bypasses their own nominal limit.
    // The actual limit check is now performed atomically after the AI call. This is for logging only.
    if (
      user.role === 'super_admin' &&
      user.promptLimit !== undefined &&
      user.promptsUsed >= user.promptLimit
    ) {
      logger.warn({
        message: 'Super Admin prompt limit bypass activated.',
        severity: 'WARNING',
        userId,
        sessionId,
        promptsUsed: user.promptsUsed,
        promptLimit: user.promptLimit,
      });
    }

    // Pre-emptive check for tenant suspension. This is a hard block and not subject to race conditions on counters.
    if (user.tenantId && user.role !== 'super_admin') {
      // Optimization: Fetch only required fields using .select() and use .lean() for a read-only, faster query.
      // Recommendation: Create a compound index on { tenantId: 1, role: 1 } in the 'users' collection for performance.
      // Architectural Note: For larger scale, consider a dedicated 'Tenants' collection to store status, avoiding this user-based lookup.
      const tenantAdmin = await UserModel.findOne({
        tenantId: user.tenantId,
        role: 'admin',
      })
        .select('tenantStatus')
        .lean();

      // PLATFORM OWNER FEATURE: Enforce tenant suspension. A Platform Owner can suspend a tenant by setting the 'tenantStatus'
      // of the tenant's admin user to 'suspended'. This check blocks all non-admin users within that tenant.
      if (tenantAdmin && tenantAdmin.tenantStatus === 'suspended') {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Workspace/Tenant is suspended. Please contact support.'
        );
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

    // PII MASKING: Sanitize the prompt to remove PII before sending it to the AI model.
    const sanitizedPrompt = _filterPII(prompt);

    // Enhance prompt using UnifiedSmartRouter for real-time market data
    const enhancedPrompt =
      await UnifiedSmartRouter.combinedRouteAndEnhancePrompt(sanitizedPrompt);

    // Add the original, un-sanitized prompt to the user's history for accurate record-keeping.
    await memory.chatHistory.addMessage(new HumanMessage(prompt));

    // Call Gemini AI to generate a response using the sanitized and enhanced prompt.
    const result = await modelToUse.generateContent(enhancedPrompt);
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No reply generated';

    // --- Start of Atomic Usage Tracking and Limit Enforcement ---
    // This block ensures that usage is only recorded if the user and their tenant are within limits.
    // The checks and increments are performed atomically to prevent race conditions.
    // If any limit is exceeded, an error is thrown, and the user does not receive the AI's reply.
    try {
      // Step 1: Atomically increment the user's personal prompt usage, checking their limit.
      // PLATFORM OWNER FEATURE: Super admins have unlimited access and bypass this check.
      if (user.role !== 'super_admin') {
        const userUpdateResult = await UserModel.updateOne(
          {
            _id: userId,
            // This filter ensures the update only happens if the user is below their prompt limit,
            // or if they have no limit set (null/undefined).
            $or: [
              { promptLimit: null },
              { promptLimit: { $exists: false } },
              { $expr: { $lt: ['$promptsUsed', '$promptLimit'] } },
            ],
          },
          { $inc: { promptsUsed: 1 } }
        );

        // If no document was modified, it means the user exists but has hit their limit.
        if (userUpdateResult.modifiedCount === 0) {
          throw new ApiError(
            httpStatus.PAYMENT_REQUIRED,
            'User prompt limit exceeded. Your request was processed but could not be saved.'
          );
        }
      } else {
        // For super_admin, just increment without a limit check.
        await UserModel.findByIdAndUpdate(userId, { $inc: { promptsUsed: 1 } });
      }

      // Step 2: Propagate usage up the hierarchy, including an atomic tenant-level limit check.
      const propagationPromises = [];

      // Propagate to Manager (no limit check, just increment)
      if (user.managerId) {
        propagationPromises.push(
          UserModel.findByIdAndUpdate(user.managerId, {
            $inc: { managedUsageCount: 1 },
          }).then(() => {
            logger.info({
              message: 'Usage propagated to Manager',
              severity: 'INFO',
              userId,
              managerId: user.managerId,
            });
          })
        );
      }

      // Propagate to Tenant Admin, atomically checking the tenant-wide limit.
      // PLATFORM OWNER FEATURE: Super admins bypass tenant limits.
      if (user.tenantId && user.role !== 'super_admin') {
        const tenantUpdateResult = await UserModel.updateMany(
          {
            tenantId: user.tenantId,
            role: 'admin',
            // This filter ensures the update only happens if the tenant is below its usage limit,
            // or if the tenant has no limit set (null/undefined).
            $or: [
              { tenantLimit: null },
              { tenantLimit: { $exists: false } },
              { $expr: { $lt: ['$tenantUsage', '$tenantLimit'] } },
            ],
          },
          { $inc: { tenantUsage: 1 } }
        );

        // If an admin exists for the tenant but no documents were modified, the tenant has hit its limit.
        if (tenantUpdateResult.modifiedCount === 0) {
          const adminExists = await UserModel.findOne({
            tenantId: user.tenantId,
            role: 'admin',
          })
            .select('_id')
            .lean();
          if (adminExists) {
            throw new ApiError(
              httpStatus.PAYMENT_REQUIRED,
              'Workspace/Tenant limit exceeded. Your request was processed but could not be saved.'
            );
          }
        }
        logger.info({
          message: 'Usage propagated to Tenant Admins',
          severity: 'INFO',
          userId,
          tenantId: user.tenantId,
        });
      }

      // PLATFORM OWNER FEATURE: Propagate to Super Admin for global platform-wide statistics.
      propagationPromises.push(
        UserModel.updateMany(
          { role: 'super_admin' },
          { $inc: { platformUsageCount: 1 } }
        )
      );

      await Promise.all(propagationPromises);
    } catch (error) {
      // Log the primary error immediately to ensure it's captured, regardless of compensation logic outcome.
      logger.error({
        message:
          'Failed to update and propagate prompt usage after AI generation. Attempting compensation.',
        severity: 'ERROR',
        userId,
        sessionId,
        originalError: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });

      // --- Compensation Logic ---
      // Attempt to revert the user's personal prompt increment to prevent incorrect billing/usage tracking.
      // This operation is wrapped in its own try/catch to prevent a compensation failure from masking the original error.
      try {
        await UserModel.findByIdAndUpdate(userId, {
          $inc: { promptsUsed: -1 },
        });
        logger.info({
          message:
            'Successfully reverted user prompt count as part of error compensation.',
          severity: 'INFO',
          userId,
          sessionId,
        });
      } catch (compensationError) {
        // If compensation fails, log it as a critical issue for manual review.
        logger.error({
          message:
            'CRITICAL: Failed to revert user prompt count during error compensation. Manual usage review may be required.',
          severity: 'CRITICAL',
          userId,
          sessionId,
          compensationError: {
            name: compensationError.name,
            message: compensationError.message,
            stack: compensationError.stack,
          },
        });
      }

      // Re-throw the original error that triggered this catch block (e.g., ApiError for limit exceeded).
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'An error occurred while updating prompt usage.'
      );
    }
    // --- End of Atomic Usage Tracking ---

    await memory.chatHistory.addMessage(new AIMessage(reply));

    const responseData = {
      prompt,
      model: config.gemini.model_name || config.gemini_model || 'gemini-3.5-flash', // Log the configured model
      reply,
      total_time: result?.usage?.total_time || 0,
    };

    // Note: The index on { user: 1, sessionId: 1 } recommended earlier also optimizes this update.
    const updateResult = await ChatHistory.updateOne(
      { user: userId, sessionId },
      { $push: { responses: responseData } },
      { upsert: true } // Use upsert to simplify logic for new sessions
    );

    // If this was a new session, link it to the user.
    if (updateResult.upsertedCount > 0) {
      const newGeminiSession = await ChatHistory.findOne({
        user: userId,
        sessionId,
      });
      if (newGeminiSession) {
        // Note: findByIdAndUpdate is efficient as it uses the primary _id index.
        await UserModel.findByIdAndUpdate(userId, {
          $push: { geminiAiSessions: newGeminiSession._id },
        });
      }
    }

    const payload = { prompt, sessionId, reply };
    if (shouldPublishToRedis && payload) {
      await RedisClient.publish(
        GEMINI_RESPONSE_SERVICE_POST,
        JSON.stringify(payload)
      );
    }

    // PLATFORM OWNER FEATURE: Global Audit Log for all successful interactions.
    // This provides a consistent, queryable log for every successful request, crucial for oversight,
    // billing reconciliation, and security monitoring.
    logger.info({
      message: 'Gemini interaction successful.',
      severity: 'INFO',
      userId,
      userRole: user.role,
      tenantId: user.tenantId || 'N/A', // Tenant might not exist for super_admin
      sessionId,
      modelUsed: modelToUse.model,
    });

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
 * Handles interaction with the Gemini AI model, manages chat history, tracks prompt usage,
 * and persists conversation data for a given session and user. This is the primary service.
 *
 * @async
 * @function geminiService
 * @security User-Scoped Isolation: Access is restricted to the authenticated user matching `userId`.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const geminiService = async (sessionId, prompt, userId) => {
  return _handleGeminiInteraction(sessionId, prompt, userId, model, true);
};

/**
 * Handles interaction with a Gemini AI model instance (currently identical to the primary model),
 * manages chat history, tracks prompt usage, and persists conversation data for a given session and user.
 * This service is functionally very similar to `geminiService` but does not publish to Redis.
 *
 * @async
 * @function gemini25PreviewService
 * @security User-Scoped Isolation: Access is restricted to the authenticated user matching `userId`.
 * @param {string} sessionId - The unique identifier for the current chat session.
 * @param {string} prompt - The user's input prompt to the Gemini AI.
 * @param {string} userId - The ID of the user initiating the conversation.
 * @returns {Promise<{prompt: string, sessionId: string, reply: string}>} An object containing the original prompt, sessionId, and the AI's reply.
 * @throws {ApiError} If there's an issue with prompt usage, Gemini AI generation, or database operations.
 */
const gemini25PreviewService = async (sessionId, prompt, userId) => {
  return _handleGeminiInteraction(sessionId, prompt, userId, model, false);
};

/**
 * Exports an object containing various Gemini AI service functions.
 * @namespace GeminiAiService
 */
export const GeminiAiService = {
  geminiService,
  gemini25PreviewService,
};