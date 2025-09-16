import * as zod from 'zod';
const { z } = zod;

const videoGenerationSchema = z.object({
  body: z.object({
    message: z
      .string({ required_error: 'Video prompt is required' })
      .min(3, 'Video prompt must be at least 3 characters')
      .max(2000, 'Video prompt too long'),
    conversationId: z.string().optional(),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).optional(),
    durationSeconds: z.number().int().min(1).max(60).optional(),
    resolution: z.enum(['720p', '1080p']).optional(),
    model: z.string().optional(),
  }),
});

const conversationSchema = z.object({
  params: z.object({
    conversationId: z.string({ required_error: 'Conversation ID is required' }),
  }),
});

const guestUserSchema = z.object({
  params: z.object({
    guestUserId: z
      .string({ required_error: 'Guest user ID is required' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid guest user ID format'),
  }),
});

export const VideoValidation = {
  videoGenerationSchema,
  conversationSchema,
  guestUserSchema,
};

