import { z } from 'zod';
import { EXA_RESEARCH_STATUS } from './exaResearch.contant.js';

// Creates a Webset on Exa and stores the resulting record. Only `query` and
// `count` are accepted here — Webset's criteria / entity / enrichments
// options are intentionally not exposed yet, so Exa auto-detects them.
const createSearchZodSchema = z.object({
  body: z.object({
    query: z
      .string({ required_error: 'Search query is required' })
      .trim()
      .min(1)
      .max(1000),
    count: z.coerce.number().int().min(1).max(1000).optional(),
    searchSessionId: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
    isFavorite: z.boolean().optional(),
  }),
});

const updateSearchZodSchema = z.object({
  body: z
    .object({
      isFavorite: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(EXA_RESEARCH_STATUS).optional(),
      errorMessage: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required to update',
    }),
});

export const ResearchValidation = {
  createSearchZodSchema,
  updateSearchZodSchema,
};