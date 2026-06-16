import * as zod from 'zod';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';

const { z } = zod;

// --- Enterprise Rate Limiting & DDOS Guard ---
// In a production environment, the Redis client should be initialized
// and managed as part of the application's core infrastructure (e.g., in a dedicated db.js or redis.js).
// It's placed here to be self-contained as per the request.
const redisClient = createClient({
  // url: process.env.REDIS_URL || 'redis://localhost:6379'
  // Add production-ready options like socket timeouts, password, etc.
});

// The client must be connected before the server starts listening.
// It's recommended to handle the connection promise at the application's entry point.
redisClient.connect().catch(console.error);

// Create a Redis store for rate-limit-redis.
const redisStoreConversational = (redisClient && redisClient.isOpen)
  ? new RedisStore({
      // @ts-expect-error - Known issue with rate-limit-redis and ioredis/node-redis types.
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:doc_review:conv:',
    })
  : undefined;

const redisStoreReview = (redisClient && redisClient.isOpen)
  ? new RedisStore({
      // @ts-expect-error - Known issue with rate-limit-redis and ioredis/node-redis types.
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:doc_review:rev:',
    })
  : undefined;

const redisStoreHistory = (redisClient && redisClient.isOpen)
  ? new RedisStore({
      // @ts-expect-error - Known issue with rate-limit-redis and ioredis/node-redis types.
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix: 'rl:doc_review:hist:',
    })
  : undefined;

// Generic key generator to identify clients.
// Prioritizes authenticated user ID, then a guest user ID from the body, and finally falls back to IP.
// This ensures fair usage limits for both logged-in and guest users.
const keyGenerator = (req) => {
  if (req.user && req.user.id) {
    return req.user.id;
  }
  if (req.body && req.body.userId) {
    return `guest:${req.body.userId}`;
  }
  return req.ip;
};

// Rate limiter for conversational endpoints. These can be hit frequently.
// Allows for a reasonable number of messages within a short time frame to feel responsive,
// but prevents rapid-fire spam or abuse.
const conversationalLimiter = rateLimit({
  store: redisStoreConversational,
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 75, // Limit each user/IP to 75 requests per 5 minutes.
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: {
    status: 429,
    message: 'Too many messages sent. Please wait a few minutes before trying again.',
  },
});

// Stricter rate limiter for resource-intensive document review endpoints.
// These actions are costly (e.g., LLM API calls, heavy computation), so we must limit them aggressively
// to prevent cost overruns and ensure service availability.
const documentReviewLimiter = rateLimit({
  store: redisStoreReview,
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15, // Limit each user/IP to 15 reviews per hour.
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: {
    status: 429,
    message: 'You have reached the maximum number of document reviews for this hour. Please try again later.',
  },
});

// Standard rate limiter for general data-retrieval endpoints like fetching history.
// This is a baseline protection against simple DDOS or scraping attempts.
const historyLimiter = rateLimit({
  store: redisStoreHistory,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // Limit each user/IP to 200 requests per 15 minutes.
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  message: {
    status: 429,
    message: 'Too many requests. Please try again later.',
  },
});
// --- End of Rate Limiting Definitions ---

const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(5000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
  }),
});

// Schema for requesting a GCS signed URL to upload a document.
// The client should call an endpoint with this body before attempting to upload.
// The endpoint will return a URL the client can PUT the file to directly.
const generateSignedUploadUrlSchema = z.object({
  body: z.object({
    fileName: z
      .string({ required_error: 'fileName is required.' })
      .min(1, 'fileName cannot be empty.')
      .max(255, 'fileName is too long.'),
    contentType: z
      .string({ required_error: 'contentType is required.' })
      .regex(
        /^[\w-]+\/[\w-.]+(\+[\w-.]+)?$/,
        'Invalid content type format (e.g., "application/pdf").'
      ),
  }),
});

// The schema for initiating a document review.
// It now expects a reference to a file already uploaded to GCS,
// rather than receiving the file directly. This prevents writing to the local filesystem.
const reviewDocumentSchema = z.object({
  body: z.object({
    // Reference to the file in Google Cloud Storage.
    gcsObjectKey: z
      .string({ required_error: 'GCS object key is required.' })
      .min(1, 'GCS object key cannot be empty.'),
    reviewType: z
      .enum([
        'general_review',
        'grammar_check',
        'content_analysis',
        'summary',
        'suggest_improvements',
        'fact_check',
        'tone_analysis',
        'formatting_review',
      ])
      .optional(),
    reviewDepth: z
      .enum(['quick', 'standard', 'detailed', 'comprehensive'])
      .optional(),
    documentType: z
      .enum([
        'academic',
        'business',
        'technical',
        'creative',
        'legal',
        'marketing',
        'general',
      ])
      .optional(),
    aspects: z
      .array(
        z.enum([
          'grammar',
          'spelling',
          'clarity',
          'coherence',
          'structure',
          'tone',
          'formatting',
          'factual_accuracy',
          'completeness',
          'consistency',
        ])
      )
      .optional(),
    additionalInstructions: z.string().optional(),
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const DocumentReviewValidation = {
  // Zod validation schemas
  conversationalRequestSchema,
  generateSignedUploadUrlSchema, // For generating GCS upload URLs
  reviewDocumentSchema, // For starting a review with a GCS file
  getConversationHistorySchema,

  // Rate limiting middleware to be applied to the corresponding routes
  limiters: {
    conversational: conversationalLimiter,
    documentReview: documentReviewLimiter,
    history: historyLimiter,
  },
};