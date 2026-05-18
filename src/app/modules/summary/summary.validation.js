import * as zod from 'zod';
const { z } = zod;

const summaryQuerySchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Summary content or URL is required',
      })
      .min(1, 'Summary content cannot be empty'),
    conversationId: z.string().optional(),
    fileType: z.enum(['pdf', 'docx', 'txt', 'csv', 'url']).optional(),
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

export const SummaryValidation = {
  summaryQuerySchema,
  guestRateLimitSchema,
};
