import * as zod from 'zod';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
// Enterprise-grade rate limiting requires a centralized store like Redis
// to ensure limits are applied consistently across all application instances.
// This assumes a pre-configured Redis client is available for import.
import redisClient from '../../../config/redis';

const { z } = zod;

// --- Rate Limiting Middleware ---

// Create a Redis store for rate-limit-redis.
// Using a single store instance is more efficient.
const redisStore = new RedisStore({
  // @ts-expect-error - Known issue with rate-limit-redis types and ioredis/node-redis v4.
  sendCommand: (...args) => redisClient.sendCommand(args),
});

// A robust key generator for guest/unauthenticated users.
// It prioritizes a specific guest ID header, then the client's IP from X-Forwarded-For,
// and finally falls back to the direct request IP. This is crucial for accuracy when behind a proxy.
const guestKeyGenerator = (req) => {
  if (req.headers['x-guest-id']) {
    return `guest:${req.headers['x-guest-id']}`;
  }
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return `ip:${forwardedFor.split(',')[0].trim()}`;
  }
  return `ip:${req.ip}`;
};

// A key generator for authenticated users.
// It relies on user information attached to the request object by a preceding authentication middleware.
const authenticatedKeyGenerator = (req) => {
  // Assumes an authentication middleware has populated req.user with the user's unique ID.
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }
  // As a fallback, use the IP. This should be monitored, as it might indicate an issue
  // with the authentication middleware chain on protected routes.
  console.warn(
    `Rate limiter for authenticated route could not find req.user.id. Falling back to IP key for ${req.originalUrl}.`
  );
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return `ip:${forwardedFor.split(',')[0].trim()}`;
  }
  return `ip:${req.ip}`;
};

// Improvement: A centralized handler for rate limit errors to ensure consistent API responses.
// This provides a better developer experience for API consumers.
const rateLimitHandler = (req, res, next, options) => {
  res.status(options.statusCode).json({
    success: false,
    error: {
      message: options.message.error,
    },
  });
};

// Rate limiter for guest users. This is the most restrictive limit to protect
// public-facing endpoints from simple DDOS attacks and anonymous abuse.
const guestLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each guest/IP to 30 requests per windowMs
  standardHeaders: 'draft-7', // Use the latest standard for rate limit headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: guestKeyGenerator,
  message: {
    error: 'Too many requests from this guest ID or IP, please try again after 15 minutes.',
  },
  handler: rateLimitHandler,
});

// Standard rate limiter for authenticated users for most API endpoints.
// This provides a generous limit for normal application usage while still
// protecting against a compromised account or a buggy client.
const standardApiLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each authenticated user to 500 requests per windowMs
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: authenticatedKeyGenerator,
  message: {
    error: 'You have exceeded the request limit, please try again after 15 minutes.',
  },
  handler: rateLimitHandler,
});

// A stricter rate limiter for authenticated users on computationally expensive
// or high-cost endpoints (e.g., AI processing, batch jobs, inline audio transcription).
// This is a critical defense against cost runaway and resource exhaustion attacks.
const heavyApiLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each user to 60 expensive operations per windowMs
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: authenticatedKeyGenerator,
  message: {
    error:
      'You have exceeded the limit for this resource-intensive operation. Please try again after 15 minutes.',
  },
  handler: rateLimitHandler,
});

// Improvement: Upgraded regex to support HH:MM:SS and MM:SS formats for longer audio files.
// This allows any number of digits for hours, which is robust for very long recordings.
const hhMmSsRegex = /^(?:(\d+):)?([0-5]\d):([0-5]\d)$/;
const timestampErrorMessage = 'Timestamp must be in HH:MM:SS or MM:SS format.';

// Improvement: Regex to validate a base64 encoded string.
// This is more precise than a try-catch block and prevents invalid data from reaching the service.
const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

// --- Reusable Schemas & Refinements ---

// Enhancement: Added a reusable refinement to ensure end timestamps are not before start timestamps.
// This provides immediate, logical feedback to the user and prevents downstream errors.
const validateTimestampOrder = (data) => {
  if (data.startTimestamp && data.endTimestamp) {
    // Note: Simple string comparison works for HH:MM:SS/MM:SS formats if they are zero-padded.
    return data.startTimestamp <= data.endTimestamp;
  }
  return true; // Pass if one or both are not provided.
};
const timestampOrderError = {
  message: 'endTimestamp cannot be earlier than startTimestamp.',
  path: ['endTimestamp'],
};

// --- Main Validation Schemas ---

// Smart assistant validation - handles all types of requests
const smartAssistantSchema = z.object({
  body: z
    .object({
      // For chat messages
      message: z.string().optional(),

      // For audio processing
      prompt: z.string().optional(),
      processingType: z
        .enum([
          'transcribe',
          'describe',
          'summarize',
          'analyze',
          'segment',
          'question',
        ])
        .optional(),
      startTimestamp: z.string().regex(hhMmSsRegex, timestampErrorMessage).optional(),
      endTimestamp: z.string().regex(hhMmSsRegex, timestampErrorMessage).optional(),
      // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
      conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
      outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).optional(),
      includeTimestamps: z.boolean().optional(),
    })
    .refine(validateTimestampOrder, timestampOrderError)
    // Enhancement: Prevent ambiguous requests by ensuring chat and audio fields are not mixed.
    // This improves API clarity and user experience by providing a clear error.
    .refine(
      (data) => {
        const isChatMessage = !!data.message;
        const isAudioProcessing =
          !!data.processingType ||
          !!data.prompt ||
          !!data.startTimestamp ||
          !!data.endTimestamp;
        return !(isChatMessage && isAudioProcessing);
      },
      {
        message:
          "Request cannot contain both 'message' and audio processing fields (e.g., 'prompt', 'processingType') simultaneously.",
        path: ['message'],
      }
    ),
});

// Legacy schema (keeping for backwards compatibility)
const transcribeAudioSchema = z.object({
  body: z
    .object({
      prompt: z.string().optional(),
      processingType: z
        .enum([
          'transcribe',
          'describe',
          'summarize',
          'analyze',
          'segment',
          'question',
        ])
        .default('transcribe'),
      startTimestamp: z.string().regex(hhMmSsRegex, timestampErrorMessage).optional(),
      endTimestamp: z.string().regex(hhMmSsRegex, timestampErrorMessage).optional(),
      // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
      conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
      outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
      includeTimestamps: z.boolean().default(false),
    })
    .refine(validateTimestampOrder, timestampOrderError),
});

// Validate inline audio data
const transcribeInlineAudioSchema = z.object({
  body: z
    .object({
      // Improvement: Validate that audioData is a valid base64 string using a regex to prevent processing errors.
      audioData: z
        .string({
          required_error: 'Audio data is required',
        })
        .min(1, 'Audio data cannot be empty')
        .regex(base64Regex, 'audioData must be a valid base64 encoded string.'),
      mimeType: z.enum([
        'audio/wav',
        'audio/mp3',
        'audio/aiff',
        'audio/aac',
        'audio/ogg',
        'audio/flac',
        'audio/webm', // Added common web format
        'audio/mpeg', // Added common format
      ]),
      prompt: z.string().optional(),
      processingType: z
        .enum([
          'transcribe',
          'describe',
          'summarize',
          'analyze',
          'segment',
          'question',
        ])
        .default('transcribe'),
      startTimestamp: z.string().regex(hhMmSsRegex, timestampErrorMessage).optional(),
      endTimestamp: z.string().regex(hhMmSsRegex, timestampErrorMessage).optional(),
      // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
      conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
      outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
      includeTimestamps: z.boolean().default(false),
    })
    .refine(validateTimestampOrder, timestampOrderError),
});

// Validate batch transcription
const batchTranscribeSchema = z.object({
  body: z.object({
    audioFiles: z
      .array(
        z.object({
          // Enhancement: Enforce UUID format for fileId and provide a clear error if missing.
          fileId: z
            .string({ required_error: 'A fileId is required for each audio file.' })
            .uuid('Invalid File ID format.'),
          prompt: z.string().optional(),
          processingType: z
            .enum([
              'transcribe',
              'describe',
              'summarize',
              'analyze',
              'segment',
              'question',
            ])
            .default('transcribe'),
        })
      )
      // Enhancement: Improved user-facing error messages for limits.
      .min(1, 'At least one audio file is required for a batch job.')
      .max(10, 'A maximum of 10 audio files can be processed per batch job.'),
    // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
    conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
    outputFormat: z.enum(['text', 'json', 'srt', 'vtt']).default('text'),
  }),
});

// Validate segment analysis
const analyzeSegmentSchema = z.object({
  body: z.object({
    // Enhancement: Enforce UUID format for fileId to ensure data integrity.
    fileId: z.string({ required_error: 'File ID is required' }).uuid('Invalid File ID format.'),
    segments: z
      .array(
        z
          .object({
            start: z.string().regex(hhMmSsRegex, timestampErrorMessage),
            end: z.string().regex(hhMmSsRegex, timestampErrorMessage),
            prompt: z.string().optional(),
          })
          // Enhancement: Validate start/end logic for each segment individually.
          .refine((data) => data.start <= data.end, {
            message: 'Segment end time cannot be earlier than start time.',
            path: ['end'],
          })
      )
      // Enhancement: Improved user-facing error messages for limits.
      .min(1, 'At least one segment is required for analysis.')
      .max(50, 'A maximum of 50 segments can be analyzed per request.'),
    // Enhancement: Enforce UUID format for conversationId to ensure data integrity.
    conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),
  }),
});

export const TranscriptionValidation = {
  // Validation Schemas
  smartAssistantSchema,
  transcribeAudioSchema,
  transcribeInlineAudioSchema,
  batchTranscribeSchema,
  analyzeSegmentSchema,

  // Rate Limiting Middleware
  guestLimiter,
  standardApiLimiter,
  heavyApiLimiter,
};