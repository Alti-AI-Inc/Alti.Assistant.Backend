import { z } from 'zod';

// Deep research query validation schema
const deepResearchQuerySchema = z.object({
  body: z.object({
    query: z
      .string({
        required_error: 'Query is required',
      })
      .min(1, 'Query cannot be empty')
      .max(1000, 'Query must be less than 1000 characters')
      .trim(),
    generatePdf: z.boolean().optional().default(false),
    conversationId: z.string().optional(),
    maxDepth: z.number().int().min(1).max(5).optional().default(3),
    userId: z.string().optional(), // For guest users
  }),
});

// Get stats validation
const getStatsSchema = z.object({
  query: z.object({
    timeRange: z.enum(['7d', '30d', '90d', 'all']).optional().default('30d'),
  }),
});

// Download PDF validation
const downloadPDFSchema = z.object({
  params: z.object({
    savedId: z.string({
      required_error: 'Saved ID is required',
    }),
  }),
});

export const DeepResearchValidation = {
  deepResearchQuerySchema,
  getStatsSchema,
  downloadPDFSchema,
};
