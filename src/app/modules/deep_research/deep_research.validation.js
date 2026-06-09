/**
 * @file This file defines Zod schemas for validating various deep research-related API requests.
 * It includes schemas for deep research queries, statistics retrieval, and PDF downloads.
 * These schemas are used to ensure incoming request data conforms to expected formats and constraints.
 */

import { z } from 'zod';

/**
 * @constant {z.ZodObject} deepResearchQuerySchema - Zod schema for validating deep research query requests.
 * Validates the `body` of a request, ensuring all necessary parameters for a deep research query are present and correctly formatted.
 *
 * @property {object} body - The request body containing deep research parameters.
 * @property {string} body.message - The user's query message. Required, min 1, max 1000 characters.
 * @property {boolean} [body.generatePdf=false] - Whether to generate a PDF report. Optional, defaults to false.
 * @property {string} [body.conversationId] - The ID of an existing conversation to continue. Optional.
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
    conversationId: z.string().optional(),
    maxDepth: z.number().int().min(1).max(5).optional().default(3),
    userId: z.string().optional(), // For guest users
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
 * @property {string} params.savedId - The ID of the saved deep research report to download as a PDF. Required.
 */
const downloadPDFSchema = z.object({
  params: z.object({
    savedId: z.string({
      required_error: 'Saved ID is required',
    }),
  }),
});

/**
 * @namespace DeepResearchValidation
 * @description An object containing all Zod validation schemas related to deep research operations.
 * These schemas are used to validate incoming request data for various deep research API endpoints.
 */
export const DeepResearchValidation = {
  deepResearchQuerySchema,
  getStatsSchema,
  downloadPDFSchema,
};