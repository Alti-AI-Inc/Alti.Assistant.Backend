import * as zod from 'zod';
const { z } = zod;

/**
 * @constant {function(string): z.ZodObject} uuidParamsSchema
 * @description A factory function that generates a Zod schema for validating a named UUID parameter from request params (e.g., URL path).
 * This is a critical utility for ensuring that resource identifiers like `workspaceId` or `conversationId`
 * are in the correct format before being processed, which is a foundational step for maintaining tenant boundaries and preventing IDOR vulnerabilities.
 * @param {string} [paramName='id'] - The name of the parameter to validate.
 * @returns {z.ZodObject} A Zod schema that validates an object containing the specified parameter as a UUID string.
 * @example
 * // To validate a route like /workspaces/:workspaceId
 * const workspaceParamsValidation = uuidParamsSchema('workspaceId');
 */
const uuidParamsSchema = (paramName = 'id') =>
  z.object({
    [paramName]: z.string().uuid({ message: `Invalid ${paramName} format` }),
  });


/**
 * @constant {z.ZodObject} codeQuerySchema
 * @description Zod schema for validating the request body of a code generation/query endpoint.
 *   It ensures that the 'message' field is present, is a string, and meets length constraints.
 *   It also allows for an optional 'conversationId' to maintain context.
 * @property {z.ZodString} message - The code query message.
 *   - Required: Yes
 *   - Minimum length: 1 character
 *   - Maximum length: 5000 characters
 * @property {z.ZodString} [conversationId] - Optional ID for continuing a conversation or thread. Must be a valid UUID.
 */
const codeQuerySchema = z.object({
  message: z
    .string({
      required_error: 'Code query is required',
    })
    .min(1, 'Code query cannot be empty')
    .max(5000, 'Code query too long'),
  // Security: Enforce UUID format for conversationId to prevent malformed inputs.
  // This is a prerequisite for preventing IDOR vulnerabilities, which must be fully
  // addressed in the service layer by checking ownership and tenancy of the conversation against the authenticated user.
  conversationId: z.string().uuid({ message: 'Invalid conversation ID format' }).optional(),
});

/**
 * @constant {z.ZodObject} guestRateLimitSchema
 * @description Zod schema for validating headers related to guest user rate limiting.
 *   This schema is designed for future enhancements to manage unauthenticated user requests.
 * @property {z.ZodString} [x-guest-id] - Optional unique identifier for a guest user, typically a UUID.
 * @property {z.ZodString} [x-forwarded-for] - Optional IP address forwarded by a proxy, indicating the client's original IP.
 */
const guestRateLimitSchema = z.object({
  // Security: Enforce UUID format for guest ID to ensure consistency and prevent malformed identifiers.
  'x-guest-id': z.string().uuid({ message: 'Invalid guest ID format' }).optional(),
  'x-forwarded-for': z.string().optional(),
});

/**
 * @exports {object} CodeValidation
 * @description An object containing Zod schemas for validating various code-related requests
 *   and associated concerns like rate limiting. These schemas are used by validation middleware
 *   to ensure incoming request data conforms to expected structures and constraints.
 * @property {function(string): z.ZodObject} uuidParamsSchema - Factory function for creating a schema to validate a UUID in request params.
 * @property {z.ZodObject} codeQuerySchema - Schema for validating the request body of code generation/query endpoints.
 * @property {z.ZodObject} guestRateLimitSchema - Schema for validating headers related to guest user rate limiting.
 */
export const CodeValidation = {
  uuidParamsSchema,
  codeQuerySchema,
  guestRateLimitSchema,
};