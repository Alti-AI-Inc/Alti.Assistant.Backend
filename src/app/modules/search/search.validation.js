import * as zod from 'zod';
const { z } = zod;

const searchQuerySchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Search query is required',
      })
      .min(1, 'Search query cannot be empty')
      .max(1000, 'Search query too long'),
    conversationId: z.string().optional(),
    deepSearch: z.boolean().optional(), // Allow deep search flag
  }),
});

// Schema for guest user rate limiting (future enhancement)
const guestRateLimitSchema = z.object({
  headers: z
    .object({
      'x-guest-id': z.string().optional(),
      'x-forwarded-for': z.string().optional(),
    })
    .optional(),
});

export const SearchValidation = {
  searchQuerySchema,
  guestRateLimitSchema,
};
