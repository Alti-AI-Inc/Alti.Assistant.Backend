import { z } from 'zod';
import { CONTENT_LIVECRAWL_OPTIONS } from './contents.constant.js';

// text/highlights accept either a plain boolean (Exa default behaviour)
// or an options object, matching Exa's own /contents request shape.
const textOptionZodSchema = z.union([
  z.boolean(),
  z.object({
    maxCharacters: z.number().int().positive().optional(),
    includeHtmlTags: z.boolean().optional(),
  }),
]);

const highlightsOptionZodSchema = z.union([
  z.boolean(),
  z.object({
    numSentences: z.number().int().positive().optional(),
    highlightsPerUrl: z.number().int().positive().optional(),
    query: z.string().optional(),
  }),
]);

const summaryOptionZodSchema = z.union([
  z.boolean(),
  z.object({
    query: z.string().optional(),
    schema: z.record(z.any()).optional(),
  }),
]);

export const contentOptionsZodSchema = z.object({
  text: textOptionZodSchema.optional(),
  highlights: highlightsOptionZodSchema.optional(),
  summary: summaryOptionZodSchema.optional(),
  livecrawl: z.enum(CONTENT_LIVECRAWL_OPTIONS).optional(),
  livecrawlTimeout: z.number().int().positive().optional(),
  subpages: z.number().int().min(0).optional(),
  subpageTarget: z.union([z.string(), z.array(z.string())]).optional(),
  context: z.union([z.boolean(), z.record(z.any())]).optional(),
});

// Triggers an Exa POST /contents call for the given ids and persists the
// response under the target space — this is the actual integration point,
// the caller supplies request options, not pre-fetched Exa output.
const createContentZodSchema = z.object({
  body: z.object({
    sourceSearch: z.string().optional(),
    ids: z.array(z.string().min(1)).min(1, 'At least one id/url is required'),
    ...contentOptionsZodSchema.shape,
    tags: z.array(z.string()).optional(),
    isFavorite: z.boolean().optional(),
  }),
});

const updateContentZodSchema = z.object({
  body: z
    .object({
      isFavorite: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      sourceSearch: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required to update',
    }),
});

export const ContentValidation = {
  createContentZodSchema,
  updateContentZodSchema,
};
