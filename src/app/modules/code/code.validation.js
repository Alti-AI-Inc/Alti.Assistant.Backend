import * as zod from 'zod';
const { z } = zod;

/**
 * @constant {z.ZodObject} codeQuerySchema
 * @description Zod schema for validating the request body of a code generation/query endpoint.
 *   It ensures that the 'message' field is present, is a string, and meets length constraints.
 *   It also allows for an optional 'conversationId' to maintain context.
 * @property {z.ZodString} message - The code query message.
 *   - Required: Yes
 *   - Minimum length: 1 character
 *   - Maximum length: 5000 characters
 *   - Error message for missing: 'Code query is required'
 *   - Error message for empty: 'Code query cannot be empty'
 *   - Error message for too long: 'Code query too long'
 * @property {z.ZodString} [conversationId] - Optional ID for continuing a conversation or thread.
 */
const codeQuerySchema = z.object({
  // Fix: Removed the 'body' wrapper. This schema is intended to validate req.body directly.
  message: z
    .string({
      required_error: 'Code query is required',
    })
    .min(1, 'Code query cannot be empty')
    .max(5000, 'Code query too long'),
  conversationId: z.string().optional(),
});

/**
 * @constant {z.ZodObject} guestRateLimitSchema
 * @description Zod schema for validating headers related to guest user rate limiting.
 *   This schema is designed for future enhancements to manage unauthenticated user requests.
 * @property {z.ZodString} [x-guest-id] - Optional unique identifier for a guest user, typically a UUID.
 * @property {z.ZodString} [x-forwarded-for] - Optional IP address forwarded by a proxy, indicating the client's original IP.
 */
const guestRateLimitSchema = z.object({
  // Fix: Removed the 'headers' wrapper and the outer .optional().
  // This schema is intended to validate req.headers directly.
  // Individual header fields can be optional, but req.headers itself is always an object.
  'x-guest-id': z.string().optional(),
  'x-forwarded-for': z.string().optional(),
});

/**
 * @exports {object} CodeValidation
 * @description An object containing Zod schemas for validating various code-related requests
 *   and associated concerns like rate limiting. These schemas are used by validation middleware
 *   to ensure incoming request data conforms to expected structures and constraints.
 * @property {z.ZodObject} codeQuerySchema - Schema for validating the request body of code generation/query endpoints.
 * @property {z.ZodObject} guestRateLimitSchema - Schema for validating headers related to guest user rate limiting.
 */
export const CodeValidation = {
  codeQuerySchema,
  guestRateLimitSchema,
};