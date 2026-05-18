import * as zod from 'zod';
const { z } = zod;

const codeQuerySchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Code query is required',
      })
      .min(1, 'Code query cannot be empty')
      .max(5000, 'Code query too long'),
    conversationId: z.string().optional(),
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

export const CodeValidation = {
  codeQuerySchema,
  guestRateLimitSchema,
};
