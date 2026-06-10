/**
 * @file This file defines Zod schemas for validating various requests related to the plan generation module.
 * It ensures that incoming data for conversational requests, plan generation, refinement, export,
 * conversation history retrieval, and brainstorming adheres to predefined structures and constraints.
 * These schemas are used by middleware to validate request bodies and parameters before processing.
 */

import * as zod from 'zod';
const { z } = zod;

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The user's message for the conversational interaction. Must be between 1 and 5000 characters.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [userId] - Optional ID of the user, primarily for guest users.
 */
/**
 * @typedef {object} ConversationalRequestSchema
 * @property {ConversationalRequestBody} body - The request body for a conversational interaction.
 */
/**
 * Zod schema for validating conversational requests.
 * Ensures the request body contains a message and optionally a conversationId and userId.
 * @type {z.ZodObject<any, any, any, any, any>}
 */
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

/**
 * @typedef {object} GeneratePlanConstraints
 * @property {number} [budget] - The budget constraint for the plan.
 * @property {string} [timeline] - The timeline constraint for the plan (e.g., "3 months").
 * @property {number} [teamSize] - The size of the team available for the plan.
 * @property {string[]} [resources] - A list of specific resources available for the plan.
 */
/**
 * @typedef {'market_analysis'|'competitive_landscape'|'resource_needs'|'timeline_estimation'|'risk_assessment'|'stakeholder_mapping'|'financial_projections'|'technical_feasibility'|'swot_analysis'|'success_metrics'} BrainstormAspect
 */
/**
 * @typedef {object} GeneratePlanRequestBody
 * @property {string} idea - A detailed description of the idea for which the plan is to be generated. Must be between 10 and 5000 characters.
 * @property {'business_plan'|'project_plan'|'product_launch'|'event_plan'|'marketing_campaign'|'research_plan'|'content_strategy'|'startup_plan'|'general'} [planType] - The type of plan to generate.
 * @property {'simple'|'moderate'|'complex'|'enterprise'} [complexity] - The desired complexity level of the plan.
 * @property {'quick'|'standard'|'comprehensive'|'strategic'} [planDepth] - The desired depth of the plan.
 * @property {('technical'|'business'|'marketing'|'financial'|'operations'|'legal'|'design'|'hr')[]} [domains] - Specific domains to focus on within the plan.
 * @property {GeneratePlanConstraints} [constraints] - Optional constraints for the plan, such as budget or timeline.
 * @property {BrainstormAspect[]} [brainstormAspects] - Specific aspects to brainstorm during plan generation.
 */
/**
 * @typedef {object} GeneratePlanSchema
 * @property {GeneratePlanRequestBody} body - The request body for generating a plan.
 */
/**
 * Zod schema for validating requests to generate a new plan.
 * Ensures the request body contains an idea description and optional parameters for plan type, complexity, depth, domains, constraints, and brainstorming aspects.
 * @type {z.ZodObject<any, any, any, any, any>}
 */
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

/**
 * @typedef {object} RefinePlanRequestBody
 * @property {string} conversationId - The ID of the conversation associated with the plan to be refined. Required.
 * @property {'executive_summary'|'objectives'|'phases'|'action_items'|'resources'|'risks'|'metrics'|'timeline'|'budget'|'stakeholders'|'alternatives'} [section] - The specific section of the plan to refine.
 * @property {string} refinementRequest - A detailed description of the refinement requested. Must be between 1 and 2000 characters.
 * @property {string} [userId] - Optional ID of the user, primarily for guest users.
 */
/**
 * @typedef {object} RefinePlanSchema
 * @property {RefinePlanRequestBody} body - The request body for refining a plan.
 */
/**
 * Zod schema for validating requests to refine an existing plan.
 * Requires a conversationId and a refinementRequest, with an optional section to target.
 * @type {z.ZodObject<any, any, any, any, any>}
 */
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

/**
 * @typedef {object} ExportPlanRequestBody
 * @property {string} conversationId - The ID of the conversation associated with the plan to be exported. Required.
 * @property {'pdf'|'docx'|'json'|'markdown'|'html'} [format='pdf'] - The desired export format for the plan. Defaults to 'pdf'.
 * @property {string} [userId] - Optional ID of the user, primarily for guest users.
 */
/**
 * @typedef {object} ExportPlanSchema
 * @property {ExportPlanRequestBody} body - The request body for exporting a plan.
 */
/**
 * Zod schema for validating requests to export a plan.
 * Requires a conversationId and allows an optional format specification.
 * @type {z.ZodObject<any, any, any, any, any>}
 */
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

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The ID of the conversation whose history is to be retrieved. Required.
 */
/**
 * @typedef {object} GetConversationHistorySchema
 * @property {GetConversationHistoryParams} params - The request parameters for getting conversation history.
 */
/**
 * Zod schema for validating requests to retrieve conversation history.
 * Requires a conversationId in the request parameters.
 * @type {z.ZodObject<any, any, any, any, any>}
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * @typedef {object} BrainstormContext
 * @property {string} [industry] - The industry relevant to the idea.
 * @property {string} [targetMarket] - The target market for the idea.
 * @property {number} [budget] - The budget available for the idea.
 * @property {string} [timeline] - The timeline for the idea (e.g., "6 months").
 */
/**
 * @typedef {object} BrainstormRequestBody
 * @property {string} idea - A detailed description of the idea for brainstorming. Must be between 10 and 5000 characters.
 * @property {BrainstormAspect[]} [aspects] - Specific aspects to brainstorm.
 * @property {BrainstormContext} [context] - Optional contextual information for the brainstorming session.
 */
/**
 * @typedef {object} BrainstormSchema
 * @property {BrainstormRequestBody} body - The request body for a brainstorming session.
 */
/**
 * Zod schema for validating requests to initiate a brainstorming session.
 * Requires an idea description and allows optional aspects and contextual information.
 * @type {z.ZodObject<any, any, any, any, any>}
 */
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

/**
 * @typedef {object} PlanGeneratorValidation
 * @property {z.ZodObject<any, any, any, any, any>} conversationalRequestSchema - Schema for validating conversational requests.
 * @property {z.ZodObject<any, any, any, any, any>} generatePlanSchema - Schema for validating plan generation requests.
 * @property {z.ZodObject<any, any, any, any, any>} refinePlanSchema - Schema for validating plan refinement requests.
 * @property {z.ZodObject<any, any, any, any, any>} exportPlanSchema - Schema for validating plan export requests.
 * @property {z.ZodObject<any, any, any, any, any>} getConversationHistorySchema - Schema for validating requests to get conversation history.
 * @property {z.ZodObject<any, any, any, any, any>} brainstormSchema - Schema for validating brainstorming requests.
 */
/**
 * An object containing all Zod validation schemas for the plan generator module.
 * These schemas are used to validate incoming request data for various API endpoints.
 * @type {PlanGeneratorValidation}
 */
export const PlanGeneratorValidation = {
  conversationalRequestSchema,
  generatePlanSchema,
  refinePlanSchema,
  exportPlanSchema,
  getConversationHistorySchema,
  brainstormSchema,
};