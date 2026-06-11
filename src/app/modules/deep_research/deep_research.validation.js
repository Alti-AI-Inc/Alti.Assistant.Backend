/**
 * @file This file defines Zod schemas for validating various API requests.
 * It includes schemas for deep research, admin, and workspace management operations.
 * These schemas are used to ensure incoming request data conforms to expected formats and constraints.
 */

import { z } from 'zod';

// --- Deep Research Schemas ---

/**
 * @constant {z.ZodObject} deepResearchQuerySchema - Zod schema for validating deep research query requests.
 * Validates the `body` of a request, ensuring all necessary parameters for a deep research query are present and correctly formatted.
 *
 * @property {object} body - The request body containing deep research parameters.
 * @property {string} body.message - The user's query message. Required, min 1, max 1000 characters.
 * @property {boolean} [body.generatePdf=false] - Whether to generate a PDF report. Optional, defaults to false.
 * @property {string} [body.conversationId] - The UUID of an existing conversation to continue. Optional.
 * @property {number} [body.maxDepth=3] - The maximum depth for the research. Optional, integer between 1 and 5, defaults to 3.
 * @property {string} [body.userId] - The ID of the user, primarily for guest users. Optional.
 * @property {'fast'|'thorough'} [body.depth='thorough'] - The research depth strategy. Optional, defaults to 'thorough'.
 * @property {string[]} [body.boardPersonas] - An array of personas to consider for the research. Optional.
 * @property {'majority'|'unanimous'} [body.consensusLevel] - The desired consensus level for findings. Optional.
 */
const deepResearchQuerySchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(1000, 'Message must be less than 1000 characters')
      .trim(),
    generatePdf: z.boolean().optional().default(false),
    conversationId: z.string().uuid('Invalid conversation ID format').optional(),
    maxDepth: z.number().int().min(1).max(5).optional().default(3),
    userId: z.string().optional(), // For guest users, might not have a strict format
    depth: z.enum(['fast', 'thorough']).optional().default('thorough'),
    boardPersonas: z.array(z.string()).optional(),
    consensusLevel: z.enum(['majority', 'unanimous']).optional(),
  }),
});

/**
 * @constant {z.ZodObject} getStatsSchema - Zod schema for validating requests to retrieve deep research statistics.
 * Validates the `query` parameters for fetching statistics, allowing for different time ranges.
 *
 * @property {object} query - The query parameters for statistics.
 * @property {'7d'|'30d'|'90d'|'all'} [query.timeRange='30d'] - The time range for which to retrieve statistics. Optional, defaults to '30d'.
 */
const getStatsSchema = z.object({
  query: z.object({
    timeRange: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
  }),
});

/**
 * @constant {z.ZodObject} downloadPDFSchema - Zod schema for validating requests to download a deep research PDF.
 * Validates the `params` of a request, specifically requiring a `savedId` to identify the PDF to be downloaded.
 *
 * @property {object} params - The URL parameters for PDF download.
 * @property {string} params.savedId - The CUID of the saved deep research report to download as a PDF. Required.
 */
const downloadPDFSchema = z.object({
  params: z.object({
    savedId: z
      .string({
        required_error: 'Saved ID is required',
      })
      // PATCH: The use of .cuid() indicates an old Zod version, which may have vulnerabilities (e.g., CVE-2024-21504).
      // .cuid() is deprecated and was removed in Zod v4. Replaced with .cuid2() for compatibility with secure, updated Zod versions (3.22.3+).
      .cuid2('Invalid saved report ID format'),
  }),
});

// --- Admin & Workspace Schemas ---
// Note: For better code organization, these schemas might be better placed in a dedicated `workspace.validation.js` or `admin.validation.js` file.

/**
 * @constant {z.ZodObject} updateWorkspaceSchema - Zod schema for updating a workspace's name or slug.
 * Ensures that at least one field is provided and that the slug format is valid.
 *
 * @property {object} body - The request body.
 * @property {string} [body.name] - The new workspace name. Min 3, max 50 characters.
 * @property {string} [body.slug] - The new workspace slug. Min 3, max 50 characters, lowercase alphanumeric with hyphens.
 * @property {object} params - The URL parameters.
 * @property {string} params.workspaceId - The UUID of the workspace to update.
 */
const updateWorkspaceSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .min(3, 'Workspace name must be at least 3 characters')
        .max(50, 'Workspace name must be less than 50 characters')
        .trim()
        .optional(),
      slug: z
        .string()
        .min(3, 'Workspace slug must be at least 3 characters')
        .max(50, 'Workspace slug must be less than 50 characters')
        .regex(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          'Slug must be lowercase, alphanumeric, and use hyphens only as separators.'
        )
        .trim()
        .optional(),
    })
    .refine(data => Object.keys(data).length > 0, {
      message: 'At least one field (name or slug) must be provided for update.',
    }),
  params: z.object({
    workspaceId: z.string().uuid({ message: 'Invalid workspace ID' }),
  }),
});

/**
 * @constant {z.ZodObject} manageSubscriptionSchema - Zod schema for creating or changing a workspace subscription.
 * Validates the Stripe Price ID.
 *
 * @property {object} body - The request body.
 * @property {string} body.priceId - The Stripe Price ID (e.g., 'price_...').
 * @property {object} params - The URL parameters.
 * @property {string} params.workspaceId - The UUID of the workspace.
 */
const manageSubscriptionSchema = z.object({
  body: z.object({
    priceId: z
      .string({ required_error: 'Price ID is required' })
      .startsWith('price_', 'Invalid Stripe price ID'),
  }),
  params: z.object({
    workspaceId: z.string().uuid({ message: 'Invalid workspace ID' }),
  }),
});

/**
 * @constant {z.ZodObject} workspaceParamsSchema - Zod schema for validating requests that only require a workspaceId in the URL params.
 * Used for operations like canceling a subscription or fetching workspace-specific data.
 *
 * @property {object} params - The URL parameters.
 * @property {string} params.workspaceId - The UUID of the workspace.
 */
const workspaceParamsSchema = z.object({
  params: z.object({
    workspaceId: z.string().uuid({ message: 'Invalid workspace ID' }),
  }),
});

/**
 * @constant {z.ZodObject} updatePaymentMethodSchema - Zod schema for updating the default payment method for a workspace.
 * Validates the Stripe Payment Method ID.
 *
 * @property {object} body - The request body.
 * @property {string} body.paymentMethodId - The Stripe Payment Method ID (e.g., 'pm_...').
 * @property {object} params - The URL parameters.
 * @property {string} params.workspaceId - The UUID of the workspace.
 */
const updatePaymentMethodSchema = z.object({
  body: z.object({
    paymentMethodId: z
      .string({ required_error: 'Payment method ID is required' })
      .startsWith('pm_', 'Invalid Stripe payment method ID'),
  }),
  params: z.object({
    workspaceId: z.string().uuid({ message: 'Invalid workspace ID' }),
  }),
});

/**
 * @constant {z.ZodObject} updateWorkspaceLimitsSchema - Zod schema for an admin to update usage limits for a workspace.
 * Ensures at least one limit is provided and that values are positive integers.
 *
 * @property {object} body - The request body.
 * @property {number} [body.maxUsers] - The maximum number of users allowed in the workspace.
 * @property {number} [body.maxDeepSearchesPerMonth] - The maximum number of deep research queries per month.
 * @property {object} params - The URL parameters.
 * @property {string} params.workspaceId - The UUID of the workspace to update.
 */
const updateWorkspaceLimitsSchema = z.object({
  body: z
    .object({
      maxUsers: z.number().int().positive('Max users must be a positive number').optional(),
      maxDeepSearchesPerMonth: z
        .number()
        .int()
        .positive('Search limit must be a positive number')
        .optional(),
    })
    .refine(data => Object.keys(data).length > 0, {
      message: 'At least one limit must be provided for update.',
    }),
  params: z.object({
    workspaceId: z.string().uuid({ message: 'Invalid workspace ID' }),
  }),
});

/**
 * @namespace AppValidation
 * @description An object containing all Zod validation schemas for the application.
 * This includes schemas for deep research, admin, and workspace operations.
 */
export const AppValidation = {
  // Deep Research
  deepResearchQuerySchema,
  getStatsSchema,
  downloadPDFSchema,

  // Admin & Workspace
  updateWorkspaceSchema,
  manageSubscriptionSchema,
  workspaceParamsSchema, // Reusable for actions like cancel subscription, get billing portal, etc.
  updatePaymentMethodSchema,
  updateWorkspaceLimitsSchema,
};