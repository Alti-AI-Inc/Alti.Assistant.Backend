/**
 * @file This file defines Zod schemas for validating search-related requests and rate limiting.
 * @module app/modules/search/search.validation
 * @author Your Name <your.email@example.com> (Replace with actual author info if known)
 */

import * as zod from 'zod';
const { z } = zod;

/**
 * Zod schema for validating the body of a search query request.
 * It ensures that the `message` field is a non-empty string and optionally includes
 * a `conversationId` and a `deepSearch` flag.
 *
 * @type {z.ZodObject<{
 *   message: z.ZodString,
 *   conversationId: z.ZodOptional<z.ZodString>,
 *   deepSearch: z.ZodOptional<z.ZodBoolean>
 * }>}
 */
const searchQuerySchema = z.object({
  // The schema directly defines the shape of the request body (e.g., req.body),
  // not an object containing a 'body' property.
  message: z
    .string({
      required_error: 'Search query is required',
    })
    .min(1, 'Search query cannot be empty')
    .max(1000, 'Search query too long'),
  conversationId: z.string().optional(),
  deepSearch: z.boolean().optional(), // Allow deep search flag
});

/**
 * Zod schema for validating headers related to guest user rate limiting.
 * This schema is intended for future enhancements to track and limit guest user requests.
 * It optionally checks for `x-guest-id` and `x-forwarded-for` headers.
 *
 * @type {z.ZodObject<{
 *   'x-guest-id': z.ZodOptional<z.ZodString>,
 *   'x-forwarded-for': z.ZodOptional<z.ZodString>
 * }>}
 */
const guestRateLimitSchema = z.object({
  // The schema directly defines the shape of the request headers (e.g., req.headers),
  // not an object containing a 'headers' property.
  'x-guest-id': z.string().optional(),
  'x-forwarded-for': z.string().optional(),
});

/**
 * An object containing all Zod validation schemas for search-related operations.
 * This includes schemas for search queries and guest rate limiting.
 *
 * @exports SearchValidation
 * @property {z.ZodObject} searchQuerySchema - Schema for validating search request bodies.
 * @property {z.ZodObject} guestRateLimitSchema - Schema for validating guest rate limit headers.
 */
export const SearchValidation = {
  searchQuerySchema,
  guestRateLimitSchema,
};