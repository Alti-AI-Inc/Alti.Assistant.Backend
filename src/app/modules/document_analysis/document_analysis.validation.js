import * as zod from 'zod';
const { z } = zod;

const analyzeRequestSchema = z.object({
  body: z.object({
    message: z
      .string()
      .max(10000, 'Message too long (max 10000 characters)')
      .optional(),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
    analysisType: z
      .enum([
        'general',
        'sentiment',
        'summary',
        'key_points',
        'entity_extraction',
        'topic_classification',
        'language_detection',
      ])
      .optional(),
    outputFormat: z.enum(['structured', 'narrative']).optional(),
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const DocumentAnalysisValidation = {
  analyzeRequestSchema,
  getConversationHistorySchema,
};
