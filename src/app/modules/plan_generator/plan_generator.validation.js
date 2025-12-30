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

const generatePlanSchema = z.object({
  body: z.object({
    idea: z
      .string({
        required_error: 'Idea description is required',
      })
      .min(10, 'Please provide a more detailed description of your idea')
      .max(5000, 'Idea description is too long'),
    planType: z
      .enum([
        'business_plan',
        'project_plan',
        'product_launch',
        'event_plan',
        'marketing_campaign',
        'research_plan',
        'content_strategy',
        'startup_plan',
        'general',
      ])
      .optional(),
    complexity: z
      .enum(['simple', 'moderate', 'complex', 'enterprise'])
      .optional(),
    planDepth: z
      .enum(['quick', 'standard', 'comprehensive', 'strategic'])
      .optional(),
    domains: z
      .array(
        z.enum([
          'technical',
          'business',
          'marketing',
          'financial',
          'operations',
          'legal',
          'design',
          'hr',
        ])
      )
      .optional(),
    constraints: z
      .object({
        budget: z.number().optional(),
        timeline: z.string().optional(),
        teamSize: z.number().optional(),
        resources: z.array(z.string()).optional(),
      })
      .optional(),
    brainstormAspects: z
      .array(
        z.enum([
          'market_analysis',
          'competitive_landscape',
          'resource_needs',
          'timeline_estimation',
          'risk_assessment',
          'stakeholder_mapping',
          'financial_projections',
          'technical_feasibility',
          'swot_analysis',
          'success_metrics',
        ])
      )
      .optional(),
  }),
});

const refinePlanSchema = z.object({
  body: z.object({
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .min(1, 'Conversation ID cannot be empty'),
    section: z
      .enum([
        'executive_summary',
        'objectives',
        'phases',
        'action_items',
        'resources',
        'risks',
        'metrics',
        'timeline',
        'budget',
        'stakeholders',
        'alternatives',
      ])
      .optional(),
    refinementRequest: z
      .string({
        required_error: 'Refinement request is required',
      })
      .min(1, 'Please describe what you want to refine')
      .max(2000, 'Refinement request is too long'),
    userId: z.string().optional(), // For guest users
  }),
});

const exportPlanSchema = z.object({
  body: z.object({
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .min(1, 'Conversation ID cannot be empty'),
    format: z
      .enum(['pdf', 'docx', 'json', 'markdown', 'html'])
      .optional()
      .default('pdf'),
    userId: z.string().optional(), // For guest users
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const brainstormSchema = z.object({
  body: z.object({
    idea: z
      .string({
        required_error: 'Idea description is required',
      })
      .min(10, 'Please provide a more detailed description of your idea')
      .max(5000, 'Idea description is too long'),
    aspects: z
      .array(
        z.enum([
          'market_analysis',
          'competitive_landscape',
          'resource_needs',
          'timeline_estimation',
          'risk_assessment',
          'stakeholder_mapping',
          'financial_projections',
          'technical_feasibility',
          'swot_analysis',
          'success_metrics',
        ])
      )
      .optional(),
    context: z
      .object({
        industry: z.string().optional(),
        targetMarket: z.string().optional(),
        budget: z.number().optional(),
        timeline: z.string().optional(),
      })
      .optional(),
  }),
});

export const PlanGeneratorValidation = {
  conversationalRequestSchema,
  generatePlanSchema,
  refinePlanSchema,
  exportPlanSchema,
  getConversationHistorySchema,
  brainstormSchema,
};
