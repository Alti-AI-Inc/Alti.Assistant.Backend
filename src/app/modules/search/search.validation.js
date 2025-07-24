import * as zod from 'zod';
const { z } = zod;

const searchQuerySchema = z.object({
  body: z.object({
    message: z.string({
      required_error: 'Search query is required',
    }).min(1, 'Search query cannot be empty').max(1000, 'Search query too long'),
    conversationId: z.string().optional(),
  }),
});

export const SearchValidation = {
  searchQuerySchema,
};
