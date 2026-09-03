import { z } from 'zod';
import { contentOptionsZodSchema } from '../ExaContents/contents.validation.js';
import { EXA_SEARCH_STATUS, EXA_SEARCH_TYPE } from './exaResearch.contant.js';

const resultItemZodSchema = z.object({
  exaId: z.string().optional(),
  title: z.string().optional(),
  url: z.string({ required_error: 'Result url is required' }).url(),
  author: z.string().optional(),
  publishedDate: z.coerce.date().optional(),
  score: z.number().optional(),
  text: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  highlightScores: z.array(z.number()).optional(),
  image: z.string().optional(),
  favicon: z.string().optional(),
});

// Persists an Exa response that was already fetched elsewhere — this
// module intentionally does not call the Exa API itself.
const createSearchZodSchema = z.object({
  body: z.object({
    query: z
      .string({ required_error: 'Search query is required' })
      .trim()
      .min(1)
      .max(1000),
    searchType: z.enum(EXA_SEARCH_TYPE).optional(),
    category: z.string().optional(),
    searchSessionId: z.string().optional(),
    contents: contentOptionsZodSchema.optional(),
    requestParams: z.record(z.any()).optional(),
    results: z.array(resultItemZodSchema).optional().default([]),
    autopromptString: z.string().optional(),
    resolvedSearchType: z.string().optional(),
    requestId: z.string().optional(),
    costDollars: z.record(z.any()).optional(),
    status: z.enum(EXA_SEARCH_STATUS).optional(),
    errorMessage: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const updateSearchZodSchema = z.object({
  body: z
    .object({
      isFavorite: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(EXA_SEARCH_STATUS).optional(),
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
