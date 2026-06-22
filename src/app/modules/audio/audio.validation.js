import * as zod from 'zod';
const { z } = zod;

const audioGenerationSchema = z.object({
  body: z.object({
    message: z
      .string({ required_error: 'Audio prompt is required' })
      .min(3, 'Audio prompt must be at least 3 characters')
      .max(2000, 'Audio prompt is too long'),
    conversationId: z.string().optional(),
    voiceName: z.string().optional(),
    languageCode: z.string().optional(),
  }),
});

const conversationSchema = z.object({
  params: z.object({
    conversationId: z.string({ required_error: 'Conversation ID is required' }),
  }),
});

export const audioValidation = {
  audioGenerationSchema,
  conversationSchema,
};
