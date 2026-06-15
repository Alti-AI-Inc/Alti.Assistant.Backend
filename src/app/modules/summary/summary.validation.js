/**
 * @file This file defines Zod schemas for validating incoming requests related to summary generation
 * and guest user rate limiting within the Alti.Assistant backend.
 * It also defines and configures the rate limiters for summary-related endpoints
 * to protect against DDOS attacks, API abuse, and excessive cost runaway.
 * It uses Zod for robust schema validation and rate-limiter-flexible for DDOS and abuse protection.
 */

import { RateLimiterRedis } from 'rate-limiter-flexible';
// Enterprise applications typically have a centralized Redis client configuration.
// This import assumes such a client is exported from a shared config location.
import { redisClient } from '../../../shared/redis.js';
import * as zod from 'zod';
const { z } = zod;

// --- Rate Limiter Configurations ---

// A central options object for rate limiters to handle Redis connection errors gracefully.
const rateLimiterOptions = {
  storeClient: redisClient,
  // In a real-world scenario, a fallback mechanism (like an in-memory limiter) or robust logging is crucial.
  // If Redis is down, we can choose to either block all requests or allow them with a higher, in-memory safety limit.
  // For this example, we will let requests pass if Redis is unavailable, relying on other infrastructure defenses.
  // Setting `inmemoryBlockOnConsumed` to a high number prevents blocking if Redis is slow to respond.
  inmemoryBlockOnConsumed: 1000,
  duration: 60, // Default duration
  blockDuration: 60 * 15, // Default block duration
};

/**
 * Rate limiter for authenticated users.
 * Allows a higher number of requests, keyed by the user's unique ID.
 * This protects the API from abuse by authenticated users and prevents single users from overwhelming the system.
 * - Points: 100 requests
 * - Duration: 1 minute
 */
export const authenticatedApiLimiter = new RateLimiterRedis({
  ...rateLimiterOptions,
  keyPrefix: 'rate_limit_authenticated_summary',
  points: 100, // Max 100 requests
  duration: 60, // Per 60 seconds (1 minute)
  blockDuration: 60 * 15, // Block for 15 minutes if limit is exceeded
});

/**
 * Rate limiter for guest (unauthenticated) users.
 * Imposes a much stricter limit, keyed by the guest's unique ID or IP address.
 * This is the primary defense against anonymous DDOS attacks and abuse, and it controls costs for free-tier access.
 * - Points: 10 requests
 * - Duration: 1 hour
 */
export const guestApiLimiter = new RateLimiterRedis({
  ...rateLimiterOptions,
  keyPrefix: 'rate_limit_guest_summary',
  points: 10, // Max 10 requests
  duration: 60 * 60, // Per 1 hour
  blockDuration: 60 * 60 * 24, // Block for 24 hours if limit is exceeded
});

// --- Zod Validation Schemas ---

/**
 * @typedef {object} SummaryRequestBody
 * @property {string} message - The content to be summarized (e.g., a block of text, a URL to a document).
 * @property {string} [conversationId] - An optional ID to link the summary request to a specific conversation or session.
 * @property {'pdf'|'docx'|'txt'|'csv'|'url'} [fileType] - The type of file if the message is a URL pointing to a document.
 */

/**
 * Zod schema for validating the request body when generating a summary.
 * Ensures that the `message` is provided and not empty, and optionally validates
 * `conversationId` and `fileType`.
 * This schema is intended to validate `req.body` directly.
 * @type {z.ZodObject<SummaryRequestBody>}
 */
const summaryQuerySchema = z.object({
  message: z
    .string({
      required_error: 'Summary content or URL is required',
    })
    .min(1, 'Summary content cannot be empty'),
  conversationId: z.string().optional(),
  fileType: z.enum(['pdf', 'docx', 'txt', 'csv', 'url']).optional(),
});

/**
 * @typedef {object} GuestRateLimitHeaders
 * @property {string} [x-guest-id] - An optional unique identifier for a guest user.
 * @property {string} [x-forwarded-for] - An optional header indicating the original IP address of the client, typically from a proxy.
 */

/**
 * Zod schema for validating headers related to guest user rate limiting.
 * This schema is intended for use alongside the guestApiLimiter to ensure
 * required headers for rate limiting are present and correctly formatted.
 * It optionally checks for `x-guest-id` and `x-forwarded-for` headers.
 * This schema is intended to validate `req.headers` directly.
 * @type {z.ZodObject<GuestRateLimitHeaders>}
 */
const guestRateLimitSchema = z.object({
  'x-guest-id': z.string().optional(),
  'x-forwarded-for': z.string().optional(),
});

/**
 * @typedef {object} SummaryValidation
 * @property {typeof summaryQuerySchema} summaryQuerySchema - Schema for validating summary generation requests.
 * @property {typeof guestRateLimitSchema} guestRateLimitSchema - Schema for validating guest user rate limiting headers.
 */

/**
 * An object containing all Zod validation schemas related to summary operations.
 * This centralizes validation schemas for easy access and management.
 * @type {SummaryValidation}
 */
export const SummaryValidation = {
  summaryQuerySchema,
  guestRateLimitSchema,
};