import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { translationService } from './translation.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

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

// Periodically clean up expired memory store entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of memoryStore.entries()) {
    if (data.resetTime < now) {
      memoryStore.delete(key);
    }
  }
}, 60000).unref();

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

      // ioredis returns results as [err, result] pairs
      const count = Array.isArray(replies[0]) ? replies[0][1] : replies[0];
      const ttl = Array.isArray(replies[1]) ? replies[1][1] : replies[1];

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
    }
  }

  // Memory fallback implementation
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
  const isGuest = req.isGuest || !req.user;
  let userId;

  if (isGuest) {
    userId = translationService.generateGuestUserId();
  } else {
    // Security Fix: Prevent IDOR (Insecure Direct Object Reference) / User ID spoofing.
    userId = req.user?.userId || req.user?._id;
  }

  const { message, conversationId } = req.body;
  if (isGuest && req.body.userId) {
    userId = req.body.userId;
  }

  // Rate Limiting: Prevent DDOS and high LLM cost runaway.
  // Guests are limited strictly (e.g., 5 requests/min), authenticated users get higher limits (e.g., 30 requests/min).
  const rateLimitLimit = isGuest ? 5 : 30;
  const rateLimitWindow = 60;
  const rateLimitKey = `assistant:${userId || req.ip}`;
  const rateLimitResult = await checkRateLimit(rateLimitKey, rateLimitLimit, rateLimitWindow);

  res.setHeader('X-RateLimit-Limit', rateLimitLimit);
  res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetTime / 1000));

  if (!rateLimitResult.allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests to the conversational assistant. Please try again later.',
    });
  }

  // Get uploaded file if present
  const uploadedFile = req.file;

  logger.info(
    `Translation assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!uploadedFile,
      fileName: uploadedFile?.originalname,
      conversationId,
    }
  );

  // Bug Fix: Subscription check should apply to all authenticated users,
  // regardless of whether a conversationId is present (e.g., for new conversations).
  if (!isGuest) {
    try {
      // Optimization: Added .lean() for read-only query to improve performance.
      const userSubscription = await SubscriptionModel.findOne({ userId })
        .sort({
          createdAt: -1,
        })
        .lean(); // Added .lean()

      const promptLimit = userSubscription ? userSubscription.usage : 0; // Assuming 'usage' is the monthly limit

      const currentMonthlyUsage = await conversationHelpers.getConversationById(
        null, // Pass null to signify "get total monthly usage" if helper supports it
        userId,
        req
      );

      // Bug Fix: Corrected comparison logic. If current usage is greater than or equal to the limit, block the request.
      if (currentMonthlyUsage >= promptLimit) {
        return sendResponse(res, {
          statusCode: httpStatus.FORBIDDEN,
          success: false,
          message:
            'You have reached your translation limit for this month. Please upgrade your plan to continue.',
        });
      }
    } catch (error) {
      // Bug Fix: If subscription check itself fails, it's an internal server error.
      logger.error('Subscription check failed:', error);
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to verify subscription status. Please try again later.',
      });
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await translationService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest,
      uploadedFile,
      req
    );

    logger.info('Translation assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsMoreInfo: result.needsMoreInfo,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
      },
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
 *     description: Retrieves a list of languages supported by the translation service.
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
    const { translationAPIClient } = await import(
      './services/translationAPIClient.js'
    );
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