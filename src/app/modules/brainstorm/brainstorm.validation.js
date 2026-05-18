import * as zod from 'zod';
const { z } = zod;

const conversationalBrainstormSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(10, 'Message must be at least 10 characters')
      .max(5000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
  }),
});

const structuredBrainstormSchema = z.object({
  body: z.object({
    idea: z
      .string({
        required_error: 'Idea is required',
      })
      .min(10, 'Idea must be at least 10 characters')
      .max(2000, 'Idea description too long'),
    brainstormType: z
      .enum([
        'product_idea',
        'business_strategy',
        'marketing_campaign',
        'technical_solution',
        'creative_content',
        'problem_solving',
        'process_improvement',
        'general',
      ])
      .optional(),
    perspective: z
      .array(
        z.enum([
          'business',
          'technical',
          'creative',
          'user_centric',
          'strategic',
          'operational',
          'financial',
          'competitive',
        ])
      )
      .optional(),
    technique: z
      .enum([
        'scamper',
        'mind_map',
        'six_thinking_hats',
        'swot',
        'five_whys',
        'reverse_brainstorm',
        'brainwriting',
        'free_association',
        'starbursting',
        'role_storming',
      ])
      .optional(),
    depth: z.enum(['quick', 'standard', 'deep', 'comprehensive']).optional(),
    iterations: z.number().min(1).max(5).optional(),
    focusAreas: z
      .array(
        z.enum([
          'innovation',
          'feasibility',
          'marketability',
          'scalability',
          'uniqueness',
          'profitability',
          'user_value',
          'sustainability',
        ])
      )
      .optional(),
    constraints: z
      .object({
        budget: z.string().optional(),
        timeline: z.string().optional(),
        technology: z.array(z.string()).optional(),
        targetAudience: z.string().optional(),
        industry: z.string().optional(),
        competitors: z.array(z.string()).optional(),
      })
      .optional(),
    additionalInstructions: z.string().max(1000).optional(),
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const exportBrainstormSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
    format: z
      .enum(['json', 'markdown', 'pdf', 'html'])
      .optional()
      .default('markdown'),
    includeHistory: z.boolean().optional().default(true),
  }),
});

const refineBrainstormSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
    message: z.string().min(10).max(2000),
    focusOn: z
      .array(z.string())
      .optional()
      .describe('Specific ideas or aspects to focus on'),
  }),
});

export const BrainstormValidation = {
  conversationalBrainstormSchema,
  structuredBrainstormSchema,
  getConversationHistorySchema,
  exportBrainstormSchema,
  refineBrainstormSchema,
};
