import * as zod from 'zod';
const { z } = zod;

const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(50000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
  }),
});

const translateTextSchema = z.object({
  body: z.object({
    text: z
      .string({
        required_error: 'Text is required',
      })
      .min(1, 'Text cannot be empty')
      .max(100000, 'Text exceeds 100,000 character limit'),
    targetLanguage: z.string({
      required_error: 'Target language is required',
    }),
    sourceLanguage: z.string().optional(),
    preserveFormatting: z.boolean().optional(),
  }),
});

const detectLanguageSchema = z.object({
  body: z.object({
    text: z
      .string({
        required_error: 'Text is required',
      })
      .min(1, 'Text cannot be empty')
      .max(10000, 'Text too long for language detection'),
  }),
});

export const TranslationValidation = {
  conversationalRequestSchema,
  translateTextSchema,
  detectLanguageSchema,
};
