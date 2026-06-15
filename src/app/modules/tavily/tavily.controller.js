/**
 * @file This file contains the controller logic for handling AI-related requests,
 * specifically for generating responses using Google Gemini with Google Search Grounding.
 * It integrates with the Google GenAI service, manages user chat history, and provides
 * an endpoint for AI interactions.
 */

import { GoogleGenAI } from '@google/genai';
import httpStatus from 'http-status';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import config from '../../../../config/index.js';
import redisClient from '../../../shared/redis.js'; // Enterprise-grade DDOS/abuse protection requires a distributed store like Redis.
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import generateSessionId from '../../../shared/sessionGenerate.js';
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';

/**
 * @type {GoogleGenAI}
 * @description Initializes the GoogleGenAI client with the API key from configuration.
 * This client is used to interact with Google's Gemini AI models.
 */
const genAI = new GoogleGenAI(config.gemini_secret_key);

/**
 * @description Rate limiter for the Gemini AI endpoint.
 * Limits each authenticated user to 20 requests per minute to prevent abuse,
 * control costs associated with the AI model, and protect against DDOS attacks.
 * Uses Redis for a distributed, scalable rate-limiting strategy.
 */
const geminiApiLimiter = rateLimit({
  store: new RedisStore({
    // @ts-ignore
    sendCommand: (...args) => redisClient.call(...args),
  }),
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each user to 20 requests per minute.
  keyGenerator: (req, res) => {
    // Rate limit by the authenticated user's ID for precise, fair-use enforcement.
    if (!req.user?.id) {
      // Fallback to IP address if user ID is not available, though auth middleware should prevent this.
      return req.ip;
    }
    return req.user.id;
  },
  handler: (req, res, next, options) => {
    // Integrate with the existing ApiError structure for consistent error responses.
    throw new ApiError(options.statusCode, 'Too many requests, please try again after a minute.');
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers.
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
});

/**
 * @swagger
 * /api/v1/gemini/get-response:
 *   post:
 *     summary: Get AI-generated response (Gemini with Google Search Grounding)
 *     description: Processes a user's prompt using the Google Gemini AI model, which includes Google Search Grounding for enhanced responses. It also manages conversation history for the user, respects user-level limits, and tracks usage. This endpoint is rate-limited to prevent abuse.
 *     tags:
 *       - AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt for the AI.
 *                 example: "What is the capital of France?"
 *               sessionId:
 *                 type: string
 *                 description: An optional session ID to continue an existing conversation. If not provided, a new one will be generated.
 *                 example: "some_existing_session_id"
 *     responses:
 *       200:
 *         description: Response processed successfully.
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
 *                   example: "Response processed successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       description: The session ID used for the conversation.
 *                       example: "new_generated_session_id"
 *                     reply:
 *                       type: string
 *                       description: The AI-generated response.
 *                       example: "The capital of France is Paris."
 *       400:
 *         description: Validation Error or AI model failed to generate a reply.
 *       401:
 *         description: Unauthorized. User ID is missing or invalid.
 *       403:
 *         description: Forbidden. User has exceeded their usage limits.
 *       404:
 *         description: User not found.
 *       429:
 *         description: Too Many Requests. The user has exceeded the rate limit.
 *       500:
 *         description: Internal Server Error or AI model processing failed.
 */
/**
 * @function
 * @description Handles the request to get an AI-generated response using Google Gemini with Google Search Grounding.
 * It processes a user's prompt, interacts with the Gemini API, and stores the conversation history.
 * @param {import('express').Request} req - The Express request object, containing the prompt and an optional session ID in the body.
 *                                          Assumes `req.user.id` is populated by authentication middleware.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const GeminiAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, sessionId } = req.body;
  const userId = req.user?.id;
  const currentSessionId = sessionId || generateSessionId(24);

  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized: User ID is missing.');
  }

  if (!prompt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Prompt is required.');
  }

  // OPTIMIZATION: Use .lean() for read-only operations to improve performance.
  const user = await UserModel.findById(userId).select('limits usage').lean();
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }

  // PLATFORM IMPROVEMENT: Enforce user-level usage limits.
  // This ensures fair use and aligns with subscription plans.
  // Assumes a schema with `limits.dailyPrompts` and `usage.promptsToday`.
  if (user.usage?.promptsToday >= user.limits?.dailyPrompts) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You have exceeded your daily prompt limit.');
  }

  // USER EXPERIENCE IMPROVEMENT: Maintain conversation context.
  // Fetch previous messages from the current session to provide context to the AI.
  let history = [];
  if (sessionId) {
    const existingSession = await ChatHistory.findOne({
      user: userId,
      sessionId: currentSessionId,
    }).lean();

    if (existingSession) {
      // Format the history for the Gemini API's `startChat` method.
      history = existingSession.responses.flatMap(conv => [
        { role: 'user', parts: [{ text: conv.prompt }] },
        { role: 'model', parts: [{ text: conv.reply }] },
      ]);
    }
  }

  // BUG FIX & SDK ALIGNMENT: Correctly initialize the model and call the API.
  // The previous `ai.models.generateContent` was not a valid SDK method.
  // This uses the recommended `getGenerativeModel` and `startChat` for conversations.
  const model = genAI.getGenerativeModel({
    model: config.gemini_model_grounded || 'gemini-1.5-flash',
    tools: [{ googleSearch: {} }], // Enables Google Search grounding for more accurate, up-to-date responses.
  });

  const chat = model.startChat({
    history: history,
    generationConfig: {
      temperature: 0.2, // Lower temperature for more factual, grounded responses.
    },
  });

  const result = await chat.sendMessage(prompt);
  const response = result.response;
  const reply = response.text();

  if (!reply) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'AI model failed to generate a reply.');
  }

  const total_tokens = response.usageMetadata?.totalTokenCount || 0;

  const responseData = {
    prompt,
    model: model.model,
    reply,
    total_tokens,
  };

  // OPTIMIZATION: Use findOneAndUpdate with upsert for an atomic and efficient DB operation.
  // This creates or updates the chat session in a single database call.
  const chatSession = await ChatHistory.findOneAndUpdate(
    { user: userId, sessionId: currentSessionId },
    {
      $push: { responses: responseData },
      $setOnInsert: { user: userId, sessionId: currentSessionId },
    },
    { new: true, upsert: true, runValidators: true }
  );

  // PLATFORM IMPROVEMENT: Atomically update user usage metrics and link the session.
  // This ensures accurate tracking of prompts and tokens for billing and limit enforcement.
  await UserModel.findByIdAndUpdate(userId, {
    $inc: {
      'usage.promptsToday': 1,
      'usage.promptsTotal': 1,
      'usage.tokensThisMonth': total_tokens,
      'usage.tokensTotal': total_tokens,
    },
    $addToSet: { aiSessions: chatSession._id }, // Use $addToSet to prevent duplicate session IDs.
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: { sessionId: currentSessionId, reply },
  });
});

/**
 * @description Controller for handling AI-related requests, specifically for generating responses using Google Gemini.
 * This object exports various handler functions for AI interactions.
 * @type {object}
 * @property {Array<Function>} GeminiAiGetResponse - An array containing the rate-limiting middleware and the controller function.
 *                                                   This should be spread in the router definition (e.g., ...GeminiAiController.GeminiAiGetResponse).
 */
// NAMING FIX: Renamed controller to reflect the use of Google Gemini, not Tavily.
export const GeminiAiController = {
  // SECURITY ENHANCEMENT: Bind the rate limiter directly to the controller export.
  // This ensures that the endpoint is protected against abuse and DDOS attacks wherever it's used.
  GeminiAiGetResponse: [geminiApiLimiter, GeminiAiGetResponse],
};