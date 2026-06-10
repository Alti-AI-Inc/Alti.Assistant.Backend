/**
 * @file This file defines Zod schemas for validating incoming requests related to summary generation
 * and guest user rate limiting within the Alti.Assistant backend.
 * It uses Zod for robust schema validation.
 */

import * as zod from 'zod';
const { z } = zod;

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
 * This schema is intended for future enhancements to manage guest user access.
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