import { GoogleGenAI } from '@google/genai';
import httpStatus from 'http-status';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import generateSessionId from '../../../shared/sessionGenerate.js';
import redisClient from '../../../shared/redis.js'; // Enterprise-grade rate limiting requires a distributed store like Redis.
import UserModel from '../auth/auth.model.js';
import ChatHistory from '../conversations/chatHistory.model.js';

// --- DDOS & ABUSE PROTECTION: RATE LIMITER SETUP ---
// This endpoint is resource-intensive (external AI API call, DB writes) and costly.
// We apply layered rate-limiting based on the authenticated user's ID to prevent abuse,
// control costs, and ensure service availability for all users.

// Assumes a shared Redis client is available for a distributed, scalable rate-limiting state.
const storeMinute = new RedisStore({
  // @ts-expect-error - Known issue with rate-limit-redis and ioredis types
  sendCommand: (...args) => redisClient.call(...args),
  prefix: 'rl:google-search:minute:',
});

const storeDaily = new RedisStore({
  // @ts-expect-error - Known issue with rate-limit-redis and ioredis types
  sendCommand: (...args) => redisClient.call(...args),
  prefix: 'rl:google-search:daily:',
});

// LAYER 1: Strict Per-Minute Limiter
// Protects against short-term, high-frequency burst attacks and API abuse.
// Allows a reasonable number of requests for a normal conversational flow.
const googleSearchPerMinuteLimiter = rateLimit({
  store: storeMinute,
  windowMs: 60 * 1000, // 1 minute window
  max: 15, // Limit each user to 15 requests per minute
  keyGenerator: (req) => req.user.id, // Base the limit on the authenticated user's ID
  handler: (req, res) => {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please wait a minute before trying again.',
    });
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// LAYER 2: Generous Daily Limiter
// Protects against sustained, long-term abuse and prevents excessive cost runaway.
const googleSearchDailyLimiter = rateLimit({
  store: storeDaily,
  windowMs: 24 * 60 * 60 * 1000, // 24 hour window
  max: 200, // Limit each user to 200 requests per day
  keyGenerator: (req) => req.user.id, // Base the limit on the authenticated user's ID
  handler: (req, res) => {
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'You have reached your daily usage limit for this feature.',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
// --- END OF RATE LIMITER SETUP ---

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

const GoogleSearchGetResponse = catchAsync(async (req, res) => {
  const prompt = req.body?.prompt;
  // Security Fix: userId should come from the authenticated user (e.g., req.user.id)
  // to prevent Insecure Direct Object Reference (IDOR) vulnerabilities,
  // where one user could potentially create or view sessions for another user.
  // This assumes an authentication middleware has populated req.user.
  const userId = req.user.id; // Assuming req.user.id is available from authentication middleware
  const sessionId = req.body?.sessionId;
  const currentSessionId = sessionId || generateSessionId(24);

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Validation Error',
      errorMessages: [{ path: 'prompt', message: 'Prompt is required.' }],
    });
  }

  // Optimization: Added .lean() as we only need to check for user existence and don't modify the user object.
  const user = await UserModel.findById(userId).lean();
  if (!user) {
    // This check is still valid to ensure the authenticated user actually exists in the DB.
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'User not found.',
    });
  }

  try {
    // Use Gemini with Google Search Grounding
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      },
    });

    const candidate = result.candidates?.[0];
    const reply = candidate?.content?.parts
      ?.filter((part) => part.text && !part.thought)
      ?.map((part) => part.text)
      ?.join('') || 'No reply generated';

    if (!reply || reply === 'No reply generated') {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Validation Error',
        errorMessages: [
          {
            path: 'message',
            message: 'Reply could not be generated by the AI model.',
          },
        ],
      });
    }

    const responseData = {
      prompt,
      model: 'gemini-2.5-flash-grounded',
      reply,
      // Bug Fix: Renamed 'total_time' to 'total_tokens' as it uses totalTokenCount, not time.
      total_tokens: result.usageMetadata?.totalTokenCount || 0,
    };

    // Performance Optimization Suggestion: For the ChatHistory.findOne query, consider adding a compound index
    // on { user: 1, sessionId: 1 } in the ChatHistory schema for better performance.
    // Example: ChatHistorySchema.index({ user: 1, sessionId: 1 });
    let session = await ChatHistory.findOne({
      user: userId,
      sessionId: currentSessionId,
    });

    if (session) {
      session.responses.push(responseData);
      await session.save();
    } else {
      session = await ChatHistory.create({
        user: userId,
        sessionId: currentSessionId,
        responses: [responseData],
      });

      // Bug Fix: Changed 'llamaAiSessions' to 'googleSearchSessions'
      // to correctly associate Google Search related sessions with the user,
      // as this module is specifically for Google Search integration.
      await UserModel.findByIdAndUpdate(userId, {
        $push: { googleSearchSessions: session._id },
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { sessionId: currentSessionId, reply },
    });
  } catch (error) {
    console.error('Error:', error.message);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'AI model processing failed.',
    });
  }
});

export const GoogleSearchController = {
  // The route handler is now an array of middlewares. The Express router will execute them in sequence.
  // This ensures rate limits are checked and enforced before the core controller logic is ever reached.
  GoogleSearchGetResponse: [
    googleSearchDailyLimiter,
    googleSearchPerMinuteLimiter,
    GoogleSearchGetResponse,
  ],
};