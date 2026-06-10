/**
 * @file Zod schemas for validating Composio-related operations.
 * @module composioValidation
 */

import { z } from 'zod';

/**
 * @typedef {object} EmailToolsValidationSchema
 * @property {string} connectedAccountId - The ID of the connected account. Must be a non-empty string.
 * @property {string} to - The recipient's email address. Must be a valid email format.
 * @property {string} subject - The subject of the email. Must be a non-empty string.
 * @property {string} body - The body content of the email. Must be a non-empty string.
 */

/**
 * Zod schema for validating input for email-related tools.
 * Ensures that all required fields for sending an email are present and correctly formatted.
 * @type {z.ZodObject<EmailToolsValidationSchema>}
 */
const emailToolsValidation = z.object({
  connectedAccountId: z.string().min(1, 'connectedAccountId is required'),
  to: z.string().email('Invalid email format'),
  subject: z
    .string()
    .min(1, 'Subject is required')
    // SECURITY: Sanitize subject by stripping HTML tags to prevent Stored XSS vulnerabilities.
    .transform((val) => val.replace(/<[^>]*>?/gm, '')),
  body: z
    .string()
    .min(1, 'Body is required')
    // SECURITY: Sanitize body by stripping HTML tags to prevent Stored XSS vulnerabilities.
    .transform((val) => val.replace(/<[^>]*>?/gm, '')),
});

/**
 * @typedef {object} LinkedinPostSchema
 * @property {string} connectedAccountId - The ID of the connected account. Must be a non-empty string.
 * @property {string} content - The content of the LinkedIn post. Must be a non-empty string.
 */

/**
 * Zod schema for validating input for creating a LinkedIn post.
 * Ensures that the connected account ID and post content are provided.
 * @type {z.ZodObject<LinkedinPostSchema>}
 */
export const linkedinPostSchema = z.object({
  connectedAccountId: z.string().min(1, 'connectedAccountId is required'),
  content: z
    .string()
    .min(1, 'Content is required')
    // SECURITY: Sanitize content by stripping HTML tags to prevent Stored XSS vulnerabilities.
    .transform((val) => val.replace(/<[^>]*>?/gm, '')),
});

/**
 * An object containing all Zod validation schemas related to Composio integrations.
 * @type {object}
 * @property {z.ZodObject<EmailToolsValidationSchema>} emailToolsValidation - Schema for validating email tool inputs.
 * @property {z.ZodObject<LinkedinPostSchema>} linkedinPostSchema - Schema for validating LinkedIn post inputs.
 */
export const composioValidation = {
  emailToolsValidation,
  linkedinPostSchema,
};