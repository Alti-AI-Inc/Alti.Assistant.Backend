import * as zod from 'zod';
const { z } = zod;

const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(5000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
  }),
});

const reviewDocumentSchema = z.object({
  body: z.object({
    reviewType: z
      .enum([
        'general_review',
        'grammar_check',
        'content_analysis',
        'summary',
        'suggest_improvements',
        'fact_check',
        'tone_analysis',
        'formatting_review',
      ])
      .optional(),
    reviewDepth: z.enum(['quick', 'standard', 'detailed', 'comprehensive']).optional(),
    documentType: z
      .enum([
        'academic',
        'business',
        'technical',
        'creative',
        'legal',
        'marketing',
        'general',
      ])
      .optional(),
    aspects: z
      .array(
        z.enum([
          'grammar',
          'spelling',
          'clarity',
          'coherence',
          'structure',
          'tone',
          'formatting',
          'factual_accuracy',
          'completeness',
          'consistency',
        ])
      )
      .optional(),
    additionalInstructions: z.string().optional(),
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const DocumentReviewValidation = {
  conversationalRequestSchema,
  reviewDocumentSchema,
  getConversationHistorySchema,
};
