import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { translationService } from './translation.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { translationAPIClient } from './services/translationAPIClient.js';

// Dynamically attempt to load the shared Redis client to prevent startup failures if not configured.
// Falls back gracefully to an in-memory rate limiter to ensure high availability.
let redisClient = null;
try {
  const redisModule = await import('../../../shared/redis.js');
  redisClient = redisModule.redisClient || redisModule.redis || redisModule.default;
} catch (error) {
  logger.warn('Redis client not found or failed to load. Falling back to in-memory rate limiting.');
}

const memoryStore = new Map();

// Periodically clean up expired memory store entries to prevent memory leaks.
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (data.resetTime < now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref(); // .unref() allows the Node.js process to exit even if this interval is running.

/**
 * Core rate-limiting evaluator supporting Redis sliding/fixed window and memory fallback.
 * Protects downstream LLM and translation APIs from cost runaway and DDOS.
 *
 * @param {string} key - Unique identifier for the rate limit bucket.
 * @param {number} limit - Maximum allowed requests within the window.
 * @param {number} windowSecs - Window duration in seconds.
 * @returns {Promise<{allowed: boolean, current: number, limit: number, remaining: number, resetTime: number}>}
 */
async function checkRateLimit(key, limit, windowSecs) {
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  if (redisClient && typeof redisClient.multi === 'function') {
    try {
      const redisKey = `rate_limit:${key}`;
      const replies = await redisClient
        .multi()
        .incr(redisKey)
        .ttl(redisKey)
        .exec();

      // The result parsing handles the [err, result] tuple format returned by ioredis's multi().exec().
      const count = Array.isArray(replies[0]) ? replies[0][1] : replies[0];
      const ttl = Array.isArray(replies[1]) ? replies[1][1] : replies[1];

      // Set expiration on the first request in a window or if the key exists without a TTL.
      if (count === 1 || ttl === -1) {
        await redisClient.expire(redisKey, windowSecs);
      }

      return {
        allowed: count <= limit,
        current: count,
        limit,
        remaining: Math.max(0, limit - count),
        resetTime: now + (ttl > 0 ? ttl * 1000 : windowMs),
      };
    } catch (err) {
      logger.error('Redis rate limiting error, falling back to memory:', err);
      // Fallthrough to memory-based limiter on Redis failure.
    }
  }

  // Memory fallback implementation for high availability.
  const record = memoryStore.get(key);
  if (!record || record.resetTime < now) {
    const newRecord = {
      count: 1,
      resetTime: now + windowMs,
    };
    memoryStore.set(key, newRecord);
    return {
      allowed: true,
      current: 1,
      limit,
      remaining: limit - 1,
      resetTime: newRecord.resetTime,
    };
  }

  record.count += 1;
  return {
    allowed: record.count <= limit,
    current: record.count,
    limit,
    remaining: Math.max(0, limit - record.count),
    resetTime: record.resetTime,
  };
}

/**
 * @swagger
 * /api/v1/translation/assistant:
 *   post:
 *     summary: Conversational Translation Assistant
 *     description: |
 *       Handles natural language requests for translation, acting as a conversational assistant.
 *       Supports both authenticated users and guests. Authenticated users are subject to subscription limits.
 *       Optionally accepts a file upload for context or content to be translated.
 *     tags:
 *       - Translation
 *     security:
 *       - BearerAuth: [] # For authenticated users
 *       - {} # For guest users (no security)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or query for the translation assistant.
 *                 example: "Translate this document into Spanish."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of an existing conversation to continue.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               userId:
 *                 type: string
 *                 description: Optional. For guest users, an identifier to resume a session. Ignored for authenticated users.
 *                 example: "guest_12345"
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or query for the translation assistant.
 *                 example: "Translate this document into Spanish."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of an existing conversation to continue.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               userId:
 *                 type: string
 *                 description: Optional. For guest users, an identifier to resume a session. Ignored for authenticated users.
 *                 example: "guest_12345"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional. An uploaded file (e.g., document, image) to be processed or translated.
 *     responses:
 *       200:
 *         description: Request processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Request processed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The assistant's response or translated text.
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the current conversation.
 *                     needsMoreInfo:
 *                       type: boolean
 *                       description: Indicates if the assistant requires more information to fulfill the request.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         description: Too many requests.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles conversational translation requests, supporting natural language input and optional file uploads.
 * This endpoint acts as an AI assistant for translation tasks.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const { message, conversationId } = req.body;
  const isGuest = !req.user;
  let userId;

  // --- User Identification and Security ---
  // This logic ensures that authenticated users cannot impersonate others,
  // while allowing guests to resume sessions.
  if (isGuest) {
    // For guests, allow resuming a session via `userId` in the body.
    // If no userId is provided, generate a new one to start a new session.
    // The service layer is responsible for validating the provided guest userId.
    userId = req.body.userId || translationService.generateGuestUserId();
  } else {
    // For authenticated users, ALWAYS use the ID from the token to prevent impersonation.
    // Any `userId` in the request body is ignored for security reasons.
    userId = req.user.userId || req.user._id;
  }

  if (!userId) {
    // This case should be rare but indicates a failure in token processing or guest ID generation.
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Could not establish user identity. Please try again.',
    });
  }

  // --- Rate Limiting ---
  // Protects the service from abuse and cost overruns. Guests have stricter limits.
  const rateLimitLimit = isGuest ? 5 : 30;
  const rateLimitWindow = 60; // seconds
  const rateLimitKey = `assistant:${userId || req.ip}`; // Fallback to IP for safety
  const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitLimit, rateLimitWindow);

  res.setHeader('X-RateLimit-Limit', rateLimitLimit);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000));

  if (!rateLimitResult.allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'You have made too many requests. Please wait a moment and try again.',
    });
  }

  // --- Subscription and Usage Limit Check (for authenticated users) ---
  if (!isGuest) {
    // BUG FIX & INTEGRATION: Implement role-based, multi-tenant subscription and usage checks.
    // The original logic only checked for user-specific subscriptions, which is incorrect
    // for users (e.g., 'user', 'manager') who are part of a workspace/team and share a subscription.
    const { role, workspaceId } = req.user;

    // Super admins can bypass usage limits for administrative purposes.
    if (role === 'super_admin') {
      logger.info(`Super admin ${userId} bypassing usage checks.`);
    } else {
      try {
        let subscription = null;
        let limitExceededMessage = '';

        // Users part of a workspace draw from the workspace's subscription pool.
        // The subscription is keyed by `workspaceId`.
        if (workspaceId) {
          subscription = await SubscriptionModel.findOne({ workspaceId })
            .sort({ createdAt: -1 })
            .lean();
          limitExceededMessage =
            'Your workspace has reached its monthly translation limit. Please contact your administrator to upgrade the plan.';
        } else {
          // Users not in a workspace are on individual plans. The subscription is keyed by `userId`.
          subscription = await SubscriptionModel.findOne({ userId })
            .sort({ createdAt: -1 })
            .lean();
          limitExceededMessage =
            'You have reached your monthly translation limit. Please upgrade your plan to continue.';
        }

        const promptLimit = subscription?.usage || 0;

        // If no active subscription is found for the user or their workspace, block the request.
        if (promptLimit <= 0) {
          return sendResponse(res, {
            statusCode: httpStatus.FORBIDDEN,
            success: false,
            message:
              'No active subscription found. Please subscribe or contact your administrator.',
          });
        }

        // The conversation helper must be aware of the context (workspace or user)
        // to calculate usage correctly. We pass the full `req` object, which contains
        // `req.user.workspaceId`, allowing the helper to sum usage for the entire workspace if applicable.
        const currentUsage = await conversationHelpers.getConversationById(
          null, // Signals the helper to calculate total usage for the billing cycle.
          userId, // The user performing the action.
          req, // The full request, containing role and workspaceId for context.
        );

        if (currentUsage >= promptLimit) {
          // INTEGRATION: In a full implementation, this is where a notification would be
          // triggered to the workspace admin/manager.
          // e.g., notificationService.notifyLimitReached(workspaceId || userId);
          return sendResponse(res, {
            statusCode: httpStatus.FORBIDDEN,
            success: false,
            message: limitExceededMessage,
          });
        }
      } catch (error) {
        logger.error(
          `Subscription/usage check failed for user ${userId} in workspace ${
            workspaceId || 'N/A'
          }:`,
          error,
        );
        return sendResponse(res, {
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          success: false,
          message:
            'Failed to verify your subscription status. Please try again later.',
        });
      }
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A message is required to start or continue a conversation.',
    });
  }

  const uploadedFile = req.file;
  logger.info(
    `Translation assistant request from ${isGuest ? `guest ${userId}` : `user ${userId}`}`,
    { hasFile: !!uploadedFile, fileName: uploadedFile?.originalname, conversationId }
  );

  try {
    const result = await translationService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest,
      uploadedFile,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', {
      error,
      userId,
      conversationId,
    });

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An unexpected error occurred while processing your request.',
      data: { conversationId, error: error.message },
    });
  }
});

/**
 * @swagger
 * /api/v1/translation/direct:
 *   post:
 *     summary: Direct Text Translation
 *     description: Translates a given text from a source language to a target language.
 *     tags:
 *       - Translation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *               - targetLanguage
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text to be translated.
 *                 example: "Hello, world!"
 *               targetLanguage:
 *                 type: string
 *                 description: The language code for the target translation (e.g., 'es' for Spanish).
 *                 example: "es"
 *               sourceLanguage:
 *                 type: string
 *                 description: Optional. The language code for the source text (e.g., 'en' for English). If not provided, language detection will be attempted.
 *                 example: "en"
 *     responses:
 *       200:
 *         description: Text translated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Translation successful"
 *                 data:
 *                   type: string
 *                   description: The translated text.
 *                   example: "Hola, mundo!"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         description: Too many requests.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles direct text translation requests.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const translateText = catchAsync(async (req, res) => {
  const { text, targetLanguage, sourceLanguage } = req.body;

  // Rate Limiting: Direct translation calls external translation APIs which incur costs.
  const clientId = req.user?.userId || req.user?._id || req.ip;
  const rateLimitLimit = 20;
  const rateLimitWindow = 60;
  const rateLimitKey = `translate:${clientId}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitLimit, rateLimitWindow);

  res.setHeader('X-RateLimit-Limit', rateLimitLimit);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000));

  if (!rateLimitResult.allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many translation requests. Please try again later.',
    });
  }

  logger.info('Direct translation request', {
    textLength: text ? text.length : 0,
    targetLanguage,
    sourceLanguage: sourceLanguage || 'auto',
    clientId,
  });

  try {
    const result = await translationService.translateTextDirect(
      text,
      targetLanguage,
      sourceLanguage
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.translation,
    });
  } catch (error) {
    logger.error('Direct translation error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Translation failed',
    });
  }
});

/**
 * @swagger
 * /api/v1/translation/detect-language:
 *   post:
 *     summary: Detect Language of Text
 *     description: Detects the language of a given text.
 *     tags:
 *       - Translation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text for which to detect the language.
 *                 example: "Hola, ¿cómo estás?"
 *     responses:
 *       200:
 *         description: Language detected successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Language detection successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     language:
 *                       type: string
 *                       description: The detected language code (e.g., 'es').
 *                       example: "es"
 *                     confidence:
 *                       type: number
 *                       format: float
 *                       description: The confidence score of the detection (0-1).
 *                       example: 0.98
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       429:
 *         description: Too many requests.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles requests to detect the language of a given text.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const detectLanguage = catchAsync(async (req, res) => {
  const { text } = req.body;

  // Rate Limiting: Prevent abuse of language detection endpoint.
  const clientId = req.user?.userId || req.user?._id || req.ip;
  const rateLimitLimit = 40;
  const rateLimitWindow = 60;
  const rateLimitKey = `detect:${clientId}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitLimit, rateLimitWindow);

  res.setHeader('X-RateLimit-Limit', rateLimitLimit);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000));

  if (!rateLimitResult.allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many language detection requests. Please try again later.',
    });
  }

  logger.info('Language detection request', {
    textLength: text ? text.length : 0,
    clientId,
  });

  try {
    const result = await translationService.detectLanguageDirect(text);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.detection,
    });
  } catch (error) {
    logger.error('Language detection error:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Language detection failed',
    });
  }
});

/**
 * @swagger
 * /api/v1/translation/supported-languages:
 *   get:
 *     summary: Get Supported Languages
 *     description: Retrieves a list of languages supported by the translation service. This endpoint is cached.
 *     tags:
 *       - Translation
 *     responses:
 *       200:
 *         description: Supported languages retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Supported languages retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         description: The language code (e.g., 'en', 'es').
 *                         example: "en"
 *                       name:
 *                         type: string
 *                         description: The name of the language (e.g., 'English', 'Spanish').
 *                         example: "English"
 *       429:
 *         description: Too many requests.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles requests to retrieve a list of languages supported by the translation service.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
export const getSupportedLanguages = catchAsync(async (req, res) => {
  // Rate Limiting: Prevent DDOS on static/semi-static metadata endpoints.
  const clientId = req.user?.userId || req.user?._id || req.ip;
  const rateLimitLimit = 100;
  const rateLimitWindow = 60;
  const rateLimitKey = `languages:${clientId}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitLimit, rateLimitWindow);

  res.setHeader('X-RateLimit-Limit', rateLimitLimit);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000));

  if (!rateLimitResult.allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests for supported languages. Please try again later.',
    });
  }

  logger.info('Get supported languages request');

  try {
    // The translationAPIClient is imported statically at the top of the file for better performance.
    const result = await translationAPIClient.getSupportedLanguages();

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Supported languages retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Get supported languages error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve supported languages',
    });
  }
});

/**
 * @typedef {object} TranslationController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} conversationalAssistant - Handles conversational translation requests.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} translateText - Handles direct text translation requests.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} detectLanguage - Handles language detection requests.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getSupportedLanguages - Handles requests to get supported languages.
 */
/**
 * Exports an object containing all translation-related controller functions.
 * @type {TranslationController}
 */
export const translationController = {
  conversationalAssistant,
  translateText,
  detectLanguage,
  getSupportedLanguages,
};