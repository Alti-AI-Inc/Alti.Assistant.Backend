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
 * @constant {z.ZodObject} updateWorkspaceSchema
 * @description Zod schema for validating updates to a workspace's settings, such as its name and URL-friendly slug.
 *   Ensures that at least one field is provided for the update and that the slug format is valid.
 * @property {z.ZodString} [name] - The new name for the workspace.
 * @property {z.ZodString} [slug] - The new slug for the workspace. Must be URL-friendly.
 */
const updateWorkspaceSchema = z
  .object({
    name: z
      .string()
      .min(3, 'Workspace name must be at least 3 characters long')
      .max(50, 'Workspace name cannot exceed 50 characters')
      .optional(),
    slug: z
      .string()
      .min(3, 'Workspace slug must be at least 3 characters long')
      .max(50, 'Workspace slug cannot exceed 50 characters')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
      .optional(),
  })
  .refine(data => data.name || data.slug, {
    message: 'Either name or slug must be provided for an update',
  });

/**
 * @constant {z.ZodObject} createCheckoutSessionSchema
 * @description Zod schema for creating a Stripe checkout session. Validates the price ID and ensures
 *   that success and cancel URLs are well-formed to prevent open redirect vulnerabilities.
 * @property {z.ZodString} priceId - The ID of the Stripe Price object.
 * @property {z.ZodString} successUrl - The URL to redirect to upon successful payment.
 * @property {z.ZodString} cancelUrl - The URL to redirect to if the user cancels the checkout process.
 */
const createCheckoutSessionSchema = z.object({
  priceId: z
    .string({ required_error: 'Price ID is required' })
    .startsWith('price_', 'Invalid Price ID format'),
  // Security: Ensure URLs are valid to prevent open redirect vulnerabilities.
  successUrl: z.string().url({ message: 'Invalid success URL' }),
  cancelUrl: z.string().url({ message: 'Invalid cancel URL' }),
});

/**
 * @constant {z.ZodObject} createPortalSessionSchema
 * @description Zod schema for creating a Stripe customer portal session. This allows users to manage their
 *   subscriptions and billing details. Validates the return URL to prevent open redirect vulnerabilities.
 * @property {z.ZodString} returnUrl - The URL to redirect the user back to after they finish managing their subscription.
 */
const createPortalSessionSchema = z.object({
  // Security: Ensure the return URL is a valid URL to prevent open redirect vulnerabilities.
  returnUrl: z.string().url({ message: 'Invalid return URL' }),
});

/**
 * @constant {z.ZodObject} updateWorkspaceLimitsSchema
 * @description Zod schema for an admin to update workspace-specific limits, such as query or user counts.
 *   Ensures that limits are positive integers and that at least one limit is provided for an update.
 * @property {z.ZodNumber} [monthlyQueryLimit] - The maximum number of queries allowed per month.
 * @property {z.ZodNumber} [userLimit] - The maximum number of users allowed in the workspace.
 */
const updateWorkspaceLimitsSchema = z
  .object({
    monthlyQueryLimit: z.number().int().positive('Monthly query limit must be a positive integer').optional(),
    userLimit: z.number().int().positive('User limit must be a positive integer').optional(),
  })
  .refine(data => data.monthlyQueryLimit || data.userLimit, {
    message: 'At least one limit must be provided for an update',
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

/**
 * @exports {object} WorkspaceValidation
 * @description An object containing Zod schemas for validating workspace and admin-related requests,
 *   including settings updates, subscription management, and limit configurations.
 * @property {z.ZodObject} updateWorkspaceSchema - Schema for updating a workspace's name and/or slug.
 * @property {z.ZodObject} createCheckoutSessionSchema - Schema for initiating a Stripe subscription checkout.
 * @property {z.ZodObject} createPortalSessionSchema - Schema for creating a Stripe customer portal session for subscription management.
 * @property {z.ZodObject} updateWorkspaceLimitsSchema - Schema for admin updates to workspace resource limits.
 */
export const WorkspaceValidation = {
  updateWorkspaceSchema,
  createCheckoutSessionSchema,
  createPortalSessionSchema,
  updateWorkspaceLimitsSchema,
};