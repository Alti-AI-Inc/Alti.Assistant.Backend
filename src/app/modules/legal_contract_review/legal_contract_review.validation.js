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
    outputFormat: z
      .enum(['text', 'markdown', 'pdf', 'docx'])
      .optional()
      .default('text'),
  }),
});

const reviewContractSchema = z.object({
  body: z.object({
    reviewType: z
      .enum([
        'general_review',
        'clause_analysis',
        'risk_assessment',
        'compliance_check',
        'fairness_evaluation',
        'terminology_check',
        'amendment_suggestions',
        'comparison',
        'summary',
      ])
      .optional(),
    reviewDepth: z
      .enum(['quick', 'standard', 'detailed', 'comprehensive'])
      .optional(),
    contractType: z
      .enum([
        'employment',
        'nda',
        'service_agreement',
        'sales',
        'lease',
        'partnership',
        'licensing',
        'purchase',
        'vendor',
        'independent_contractor',
        'franchise',
        'general',
      ])
      .optional(),
    aspects: z
      .array(
        z.enum([
          'obligations',
          'rights',
          'liabilities',
          'termination',
          'payment_terms',
          'confidentiality',
          'intellectual_property',
          'indemnification',
          'dispute_resolution',
          'force_majeure',
          'governing_law',
          'warranties',
          'jurisdiction',
          'notice_provisions',
        ])
      )
      .optional(),
    additionalInstructions: z.string().optional(),
    outputFormat: z
      .enum(['text', 'markdown', 'pdf', 'docx'])
      .optional()
      .default('text'),
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const LegalContractReviewValidation = {
  conversationalRequestSchema,
  reviewContractSchema,
  getConversationHistorySchema,
};
