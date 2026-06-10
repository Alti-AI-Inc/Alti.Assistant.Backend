import httpStatus from 'http-status';
// --- Rate Limiting & DDOS Protection Imports ---
// Using 'rate-limiter-flexible' for robust and efficient rate limiting with Redis.
import { RateLimiterRedis } from 'rate-limiter-flexible';
// Assuming a shared Redis client is configured and exported from this path.
import { redisClient } from '../../../../config/redis.js';
// --- End Rate Limiting Imports ---
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import ApiError from '../../../errors/ApiError.js';
// --- HIERARCHY & USAGE MANAGEMENT IMPORTS ---
// BUG FIX & INTEGRATION: Import services for workspace-aware usage tracking, limits, and notifications.
// This is critical for ensuring actions respect tenant boundaries and that usage is correctly propagated.
import { usageService } from '../usage/usage.service.js';
import { notificationService } from '../notification/notification.service.js';
// --- END HIERARCHY & USAGE MANAGEMENT IMPORTS ---
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import fs from 'fs/promises';
import path from 'path';
import {
  ARTICLE_WRITER_CONFIG,
  ARTICLE_TYPES,
  WRITING_TONES,
  ARTICLE_LENGTHS,
  SYSTEM_PROMPTS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  RESPONSE_MESSAGES,
} from './article_writer.constant.js';

// --- Rate Limiting & DDOS Guard Configuration ---
// Initialize rate limiters to protect against DDOS, API abuse, and cost overruns.
// Limits are applied differently for authenticated users (by userId) and guests (by IP address).

// Limiter for expensive article generation by authenticated users.
// Allows for a reasonable number of requests per minute to support normal usage.
const authenticatedArticleLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_article_auth',
  points: 15, // 15 requests per minute
  duration: 60,
  blockDuration: 60 * 15, // Block for 15 minutes if limit is exceeded
});

// Stricter limiter for expensive article generation by guest users.
// This is IP-based to prevent anonymous users from abusing the service.
const guestArticleLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_article_guest',
  points: 5, // 5 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60, // Block for 1 hour if limit is exceeded
});

// Limiter for fetching conversation history by authenticated users.
// This is a less expensive operation, so a higher limit is allowed.
const authenticatedHistoryLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_history_auth',
  points: 60, // 60 requests per minute
  duration: 60,
});

// Limiter for fetching conversation history by guest users.
// IP-based to prevent scraping or excessive polling.
const guestHistoryLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rate_limit_history_guest',
  points: 30, // 30 requests per minute
  duration: 60,
});
// --- End Rate Limiting Configuration ---

/**
 * Initializes the Google Generative AI client using the API key from configuration.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
/**
 * Initializes the Google AI File Manager client using the API key from configuration.
 * Used for uploading and managing files with Google Gemini.
 * @type {GoogleAIFileManager}
 */
const fileManager = new GoogleAIFileManager(config.gemini_secret_key);

/**
 * Generates a unique guest user ID using Mongoose's ObjectId.
 * This is used for users who are not authenticated.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for article writing sessions.
 * The ID is a combination of a timestamp and a random string.
 * @returns {string} A unique string representing a conversation ID.
 */
const generateConversationId = () => {
  return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of an article writer conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no `conversationId` is provided or the existing one is not found, a new conversation is created.
 *
 * @param {object} user - The authenticated user object, containing id, role, workspaceId, etc.
 * @param {string | null} conversationId - The ID of an existing conversation, or null to create a new one.
 * @param {string} userMessage - The initial message from the user, used for the conversation title if new.
 * @param {object} [req=null] - The Express request object, potentially containing transaction information.
 * @returns {Promise<object>} The conversation object (either existing or newly created).
 * @throws {ApiError} If there's an internal server error during conversation handling.
 */
const handleArticleWriterConversation = async (
  user,
  conversationId,
  userMessage,
  req = null
) => {
  try {
    let conversation;
    const isGuest = user.role === 'guest';

    if (conversationId) {
      try {
        // INTEGRATION FIX: Pass the full user object to the helper.
        // This allows the helper to perform role-based access control (e.g., an admin
        // can access any conversation in their workspace, while a user can only access their own).
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          user,
          req
        );
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found or access denied for user ${user.id}, creating new one`
        );
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      // HIERARCHY GAP FIX: When creating a conversation, embed the workspace and tenant context.
      // This is crucial for data isolation, billing, and allowing managers/admins to view team activity.
      const conversationData = {
        userId: user.id,
        workspaceId: user.workspaceId, // Associate conversation with the workspace
        tenantId: user.tenantId, // Associate conversation with the tenant/platform
        title: `Article: ${userMessage.substring(0, 50)}...`,
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: isGuest ? 'guest' : 'authenticated',
          isGuest,
          collectedParams: {},
          uploadedFiles: [],
        },
      };

      conversation = await conversationService.createConversation(
        conversationData,
        newConversationId,
        req
      );

      logger.info(
        `Created new article writer conversation ${newConversationId} for user ${user.id} in workspace ${user.workspaceId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling article writer conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Adds a new message to an existing conversation.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {object} user - The authenticated user object.
 * @param {'user' | 'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The text content of the message.
 * @param {object} [metadata={}] - Optional metadata to store with the message.
 * @param {object} [req=null] - The Express request object, potentially containing transaction information.
 * @returns {Promise<object>} The updated conversation object after adding the message.
 * @throws {ApiError} If there's an internal server error during message addition.
 */
const addMessage = async (
  conversationId,
  user,
  role,
  content,
  metadata = {},
  req = null
) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    // INTEGRATION FIX: Pass the full user object to the service.
    // This ensures that the service can verify that the user has permission to add a message
    // to this specific conversation, respecting workspace boundaries.
    return await conversationService.addMessageToConversation(
      conversationId,
      user,
      message,
      req
    );
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add message'
    );
  }
};

/**
 * Processes an uploaded file by uploading it to Google Gemini's file manager.
 * This makes the file accessible to Gemini models for content generation.
 *
 * @param {object} fileInfo - Information about the uploaded file.
 * @param {string} fileInfo.path - The local path to the uploaded file.
 * @param {string} fileInfo.location - Alternative local path to the uploaded file (used if `path` is not present).
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {string} fileInfo.originalName - The original name of the file.
 * @returns {Promise<{fileUri: string, mimeType: string, displayName: string} | null>} An object containing the Gemini file URI, MIME type, and display name, or null if no fileInfo is provided.
 * @throws {ApiError} If there's an internal server error during file processing or upload.
 */
const processUploadedFile = async (fileInfo) => {
  try {
    if (!fileInfo) return null;

    const filePath = fileInfo.path || fileInfo.location;
    const mimeType = fileInfo.mimetype;

    logger.info(`Processing file: ${fileInfo.originalName}, type: ${mimeType}`);

    // Upload file to Gemini
    const uploadResponse = await fileManager.uploadFile(filePath, {
      mimeType: mimeType,
      displayName: fileInfo.originalName,
    });

    logger.info(`File uploaded to Gemini: ${uploadResponse.file.uri}`);

    return {
      fileUri: uploadResponse.file.uri,
      mimeType: uploadResponse.file.mimeType,
      displayName: fileInfo.originalName,
    };
  } catch (error) {
    logger.error('Error processing file:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process uploaded file'
    );
  }
};

/**
 * Builds a comprehensive prompt for the Gemini AI model to generate an article.
 * The prompt incorporates user message, desired article type, tone, length, and file content if available.
 *
 * @param {string} message - The user's core request or topic for the article.
 * @param {string | null} articleType - The type of article (e.g., 'blog_post', 'news_article'), or null for general.
 * @param {string | null} tone - The desired writing tone (e.g., 'professional', 'casual').
 * @param {string | null} length - The desired length of the article (e.g., 'short', 'medium', 'long', 'comprehensive').
 * @param {object | null} [fileContent=null] - Optional object indicating if file content is provided, used to adjust the prompt.
 * @returns {string} The fully constructed prompt string for the AI model.
 */
const buildArticlePrompt = (
  message,
  articleType,
  tone,
  length,
  fileContent = null
) => {
  const typePrompt =
    articleType && articleType !== ARTICLE_TYPES.GENERAL
      ? SYSTEM_PROMPTS[articleType]
      : '';

  const lengthGuidelines = {
    short: '300-500 words',
    medium: '500-1000 words',
    long: '1000-2000 words',
    comprehensive: '2000+ words',
  };

  const lengthGuideline = lengthGuidelines[length] || lengthGuidelines.medium;
  const toneDescription = tone || WRITING_TONES.PROFESSIONAL;

  let prompt = `${SYSTEM_PROMPTS.CONVERSATIONAL}\n\n`;

  if (typePrompt) {
    prompt += `Article Type Instructions: ${typePrompt}\n\n`;
  }

  prompt += `Writing Requirements:
- Tone: ${toneDescription}
- Target Length: ${lengthGuideline}
- Format: Plain text with proper structure
- Use clear headings and paragraphs
- Make it engaging and well-organized\n\n`;

  if (fileContent) {
    prompt += `The user has uploaded a file with content to use as the basis for the article.\n\n`;
  }

  prompt += `User Request: ${message}\n\n`;
  prompt += `Please write the article based on these requirements. Return only the article text, properly formatted with headings and paragraphs.`;

  return prompt;
};

/**
 * Generates an article using the Google Gemini AI model based on a given prompt.
 * It can optionally include file data as context for generation.
 *
 * @param {string} prompt - The text prompt to guide the AI in generating the article.
 * @param {object | null} [fileData=null] - Optional file data object containing `mimeType` and `fileUri` for context.
 * @returns {Promise<string>} The generated article text.
 * @throws {ApiError} If there's an internal server error during article generation.
 */
const generateArticle = async (prompt, fileData = null) => {
  try {
    const model = genAI.getGenerativeModel({
      model: ARTICLE_WRITER_CONFIG.MODEL,
    });

    const generationConfig = {
      temperature: ARTICLE_WRITER_CONFIG.TEMPERATURE,
      maxOutputTokens: ARTICLE_WRITER_CONFIG.MAX_OUTPUT_TOKENS,
    };

    let result;

    if (fileData) {
      // Generate with file context
      result = await model.generateContent(
        [
          {
            fileData: {
              mimeType: fileData.mimeType,
              fileUri: fileData.fileUri,
            },
          },
          { text: prompt },
        ],
        generationConfig
      );
    } else {
      // Generate without file
      result = await model.generateContent(prompt, generationConfig);
    }

    const response = result.response;
    const articleText = response.text();

    return articleText;
  } catch (error) {
    logger.error('Error generating article with Gemini:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate article'
    );
  }
};

/**
 * Orchestrates the entire process of handling a conversational article writing request.
 * This includes managing the conversation, processing uploaded files, building the AI prompt,
 * generating the article, and updating the conversation history.
 *
 * @param {object} user - The authenticated user object, containing id, role, workspaceId, etc.
 * @param {string} message - The user's input message for the article.
 * @param {string | null} conversationId - The ID of the current conversation, or null for a new one.
 * @param {object | null} [fileInfo=null] - Optional object containing details of an uploaded file.
 * @param {string | null} [articleType=null] - The desired type of article (e.g., 'blog_post').
 * @param {string | null} [tone=null] - The desired writing tone.
 * @param {string | null} [length=null] - The desired length of the article.
 * @param {object} [req=null] - The Express request object, potentially containing transaction information.
 * @returns {Promise<{conversationId: string, userId: string, article: string, metadata: object}>} An object containing the conversation ID, user ID, generated article text, and metadata about the generation.
 * @throws {ApiError} If any step in the process fails.
 */
const processConversationalRequest = async (
  user,
  message,
  conversationId,
  fileInfo = null,
  articleType = null,
  tone = null,
  length = null,
  req = null
) => {
  const isGuest = user.role === 'guest';

  // --- Rate Limiting & DDOS Guard ---
  try {
    if (isGuest) {
      if (!req || !req.ip) {
        logger.warn(
          'IP address not available for guest user rate limiting. Request will proceed without limit check. This is a potential security risk.'
        );
      } else {
        await guestArticleLimiter.consume(req.ip);
      }
    } else {
      await authenticatedArticleLimiter.consume(user.id);
    }
  } catch (rateLimiterRes) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'You have made too many requests. Please try again later.'
    );
  }
  // --- End Rate Limiting & DDOS Guard ---

  // --- HIERARCHY GAP FIX: Workspace Usage & Limit Enforcement ---
  // For authenticated users, check if their workspace has sufficient credits/usage quota before proceeding.
  if (!isGuest) {
    try {
      await usageService.checkAndConsumeCredits(
        user.workspaceId,
        ARTICLE_WRITER_CONFIG.GENERATION_COST
      );
    } catch (error) {
      // Assuming usageService throws a specific error type for limit exhaustion
      if (error.name === 'LimitExceededError') {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, error.message);
      }
      // Re-throw other unexpected errors
      throw error;
    }
  }
  // --- End Workspace Usage & Limit Enforcement ---

  try {
    // Handle conversation (create or retrieve)
    const conversation = await handleArticleWriterConversation(
      user,
      conversationId,
      message,
      req
    );

    // Add user message to conversation
    await addMessage(
      conversation.conversationId,
      user,
      'user',
      message,
      {
        hasFile: !!fileInfo,
        fileName: fileInfo?.originalName,
      },
      req
    );

    // Process file if uploaded
    let fileData = null;
    if (fileInfo) {
      fileData = await processUploadedFile(fileInfo);

      // HIERARCHY GAP FIX: Pass the full user object for permission checks during updates.
      await conversationService.updateConversationById(
        conversation.conversationId,
        user,
        {
          $push: {
            'metadata.uploadedFiles': {
              fileName: fileInfo.originalName,
              uploadedAt: new Date(),
            },
          },
        },
        req
      );
    }

    const finalArticleType = articleType || DEFAULT_PARAMS.articleType;
    const finalTone = tone || DEFAULT_PARAMS.tone;
    const finalLength = length || DEFAULT_PARAMS.length;

    const prompt = buildArticlePrompt(
      message,
      finalArticleType,
      finalTone,
      finalLength,
      fileData
    );

    const articleText = await generateArticle(prompt, fileData);

    // Add AI response to conversation
    await addMessage(
      conversation.conversationId,
      user,
      'assistant',
      articleText,
      {
        articleType: finalArticleType,
        tone: finalTone,
        length: finalLength,
        hasFile: !!fileData,
      },
      req
    );

    // --- HIERARCHY GAP FIX: Propagate Usage and Notifications ---
    // After a successful generation, record the usage and check if notifications are needed.
    if (!isGuest) {
      const usageInfo = await usageService.getWorkspaceUsage(user.workspaceId);
      // Asynchronously send notifications to admins/managers if usage thresholds are met.
      // This is done without awaiting to avoid blocking the user's response.
      notificationService
        .notifyAdminsOnUsageThreshold(user.workspaceId, usageInfo)
        .catch(err =>
          logger.error(
            `Failed to send usage notification for workspace ${user.workspaceId}`,
            err
          )
        );
    }
    // --- End Usage Propagation ---

    if (fileInfo && fileInfo.path) {
      try {
        await fs.unlink(fileInfo.path);
        logger.info(`Cleaned up uploaded file: ${fileInfo.path}`);
      } catch (error) {
        logger.warn(`Failed to delete uploaded file: ${error.message}`);
      }
    }

    return {
      conversationId: conversation.conversationId,
      userId: user.id,
      article: articleText,
      metadata: {
        articleType: finalArticleType,
        tone: finalTone,
        length: finalLength,
      },
    };
  } catch (error) {
    // HIERARCHY GAP FIX: If generation fails, refund the consumed credits.
    if (!isGuest) {
      await usageService.refundCredits(
        user.workspaceId,
        ARTICLE_WRITER_CONFIG.GENERATION_COST
      );
    }
    logger.error('Error processing conversational article request:', error);
    // Re-throw the original error to be handled by the controller.
    throw error;
  }
};

/**
 * Retrieves the complete conversation history for a given conversation ID and user.
 *
 * @param {object} user - The authenticated user object, containing id, role, workspaceId, etc.
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {object} [req=null] - The Express request object, required for IP-based rate limiting for guests.
 * @returns {Promise<object>} The conversation object, including its messages.
 * @throws {ApiError} If the conversation is not found, the rate limit is exceeded, or an internal server error occurs.
 */
const getConversationHistory = async (user, conversationId, req = null) => {
  const isGuest = user.role === 'guest';
  // --- Rate Limiting & DDOS Guard ---
  try {
    if (isGuest) {
      if (!req || !req.ip) {
        logger.warn(
          'IP address not available for guest user rate limiting on history endpoint. Request will proceed without limit check.'
        );
      } else {
        await guestHistoryLimiter.consume(req.ip);
      }
    } else {
      await authenticatedHistoryLimiter.consume(user.id);
    }
  } catch (rateLimiterRes) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'You have made too many requests to view history. Please try again later.'
    );
  }
  // --- End Rate Limiting & DDOS Guard ---

  try {
    // INTEGRATION FIX & IDOR PREVENTION: Pass the full user object to the helper.
    // This allows the helper to perform role-based access control. For example:
    // - A 'user' can only get their own conversations.
    // - An 'admin' can get any conversation within their 'workspaceId'.
    // - A 'super_admin' can get any conversation.
    // This prevents a user from accessing another user's data, even within the same workspace, unless they have the appropriate role.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      user,
      { lean: true } // Pass lean option for performance
    );

    if (!conversation) {
      // The helper should throw an error if not found or access is denied.
      // This is a fallback.
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found or access denied');
    }

    return conversation;
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve conversation history'
    );
  }
};

/**
 * Service object for article writer functionalities.
 * Provides methods for generating user/conversation IDs, processing article requests,
 * and retrieving conversation history.
 * @namespace articleWriterService
 */
export const articleWriterService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  getConversationHistory,
};

/*
 * Database Indexing Recommendations for the 'Conversation' model:
 *
 * The 'Conversation' model (managed by `conversationService` and `conversationHelpers`)
 * is frequently queried. To optimize these lookups:
 *
 * 1. Compound Index on `(workspaceId, userId)`:
 *    - `db.conversations.createIndex({ workspaceId: 1, userId: 1 })`
 *    - Rationale: This is the most critical index. It supports queries for all conversations
 *      in a workspace (for admins/managers) and drills down to a specific user's conversations.
 *
 * 2. Unique Index on `conversationId`:
 *    - `db.conversations.createIndex({ conversationId: 1 }, { unique: true })`
 *    - Rationale: `conversationId` is the primary key for direct lookups. Making it unique
 *      enforces data integrity.
 *
 * 3. Index on `tenantId`:
 *    - `db.conversations.createIndex({ tenantId: 1 })`
 *    - Rationale: Useful for platform-level operations and data segregation if the application
 *      is multi-tenant at the highest level.
 *
 * These indexes will significantly improve query performance and scalability, especially
 * as the number of users and conversations grows.
 */