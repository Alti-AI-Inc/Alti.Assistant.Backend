/**
 * @file This file defines Zod schemas for validating various requests related to the plan generation module.
 * It ensures that incoming data for conversational requests, plan generation, refinement, export,
 * conversation history retrieval, and brainstorming adheres to predefined structures and constraints.
 * These schemas are used by middleware to validate request bodies and parameters before processing.
 * This file also defines and exports rate-limiting middleware to protect the API from abuse and DDOS attacks.
 */

import * as zod from 'zod';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { RedisClient } from '../../../shared/redis.js';

const { z } = zod;

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The user's message for the conversational interaction. Must be between 1 and 5000 characters.
 * @property {string} [conversationId] - Optional UUID of an existing conversation to continue.
 * @property {string} [userId] - Optional UUID of the user, primarily for guest users.
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
      .trim() // OPTIMIZATION: Trim whitespace from user input for better data quality and UX.
      .min(1, 'Message cannot be empty')
      .max(5000, 'Message too long'),
    conversationId: z.string().uuid('Invalid Conversation ID format').optional(), // VERIFICATION: Enforce UUID format for IDs to ensure data integrity.
    userId: z.string().uuid('Invalid User ID format').optional(), // VERIFICATION: Enforce UUID format for guest user IDs.
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
      .trim() // OPTIMIZATION: Trim whitespace from user input.
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
        budget: z.number().positive('Budget must be a positive number').optional(), // VERIFICATION: Ensure budget is a positive number.
        timeline: z.string().trim().min(1).optional(), // OPTIMIZATION: Trim and ensure timeline is not empty.
        teamSize: z
          .number()
          .int()
          .positive('Team size must be a positive integer')
          .optional(), // VERIFICATION: Ensure team size is a positive integer.
        resources: z.array(z.string().trim().min(1)).optional(), // OPTIMIZATION: Ensure resource strings are not empty.
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
 * @property {string} conversationId - The UUID of the conversation associated with the plan to be refined. Required.
 * @property {'executive_summary'|'objectives'|'phases'|'action_items'|'resources'|'risks'|'metrics'|'timeline'|'budget'|'stakeholders'|'alternatives'} [section] - The specific section of the plan to refine.
 * @property {string} refinementRequest - A detailed description of the refinement requested. Must be between 1 and 2000 characters.
 * @property {string} [userId] - Optional UUID of the user, primarily for guest users.
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
      .uuid('Invalid Conversation ID format'), // VERIFICATION: Enforce UUID format for IDs.
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
      .trim() // OPTIMIZATION: Trim whitespace from user input.
      .min(1, 'Please describe what you want to refine')
      .max(2000, 'Refinement request is too long'),
    userId: z.string().uuid('Invalid User ID format').optional(), // VERIFICATION: Enforce UUID format for guest user IDs.
  }),
});

/**
 * @typedef {object} ExportPlanRequestBody
 * @property {string} conversationId - The UUID of the conversation associated with the plan to be exported. Required.
 * @property {'pdf'|'docx'|'json'|'markdown'|'html'} [format='pdf'] - The desired export format for the plan. Defaults to 'pdf'.
 * @property {string} [userId] - Optional UUID of the user, primarily for guest users.
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
      .uuid('Invalid Conversation ID format'), // VERIFICATION: Enforce UUID format for IDs.
    format: z
      .enum(['pdf', 'docx', 'json', 'markdown', 'html'])
      .optional()
      .default('pdf'),
    userId: z.string().uuid('Invalid User ID format').optional(), // VERIFICATION: Enforce UUID format for guest user IDs.
  }),
});

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The UUID of the conversation whose history is to be retrieved. Required.
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
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .uuid('Invalid Conversation ID format'), // VERIFICATION: Enforce UUID format for consistency and correctness.
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
      .trim() // OPTIMIZATION: Trim whitespace from user input.
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
        industry: z.string().trim().min(1).optional(), // OPTIMIZATION: Trim and ensure context strings are not empty.
        targetMarket: z.string().trim().min(1).optional(),
        budget: z.number().positive('Budget must be a positive number').optional(), // VERIFICATION: Ensure budget is a positive number.
        timeline: z.string().trim().min(1).optional(),
      })
      .optional(),
  }),
});

// --- Rate Limiting & DDOS Protection ---

// OPTIMIZATION: Centralized Redis client management for rate limiting.
// This IIFE (Immediately Invoked Function Expression) creates a single, managed Redis client instance
// and connects it, making the module more robust and self-contained.
/**
 * Helper to create a unique Redis store for each rate limiter if a client is available.
 * This allows for distributed rate limiting across multiple server instances without store sharing crashes.
 * If Redis is not configured, express-rate-limit will default to an in-memory store.
 * @param {string} prefix - The unique prefix for the store keys.
 * @returns {RedisStore|undefined} The RedisStore instance or undefined.
 */
const createRateLimitStore = (prefix) => {
  return RedisClient.isEnabled
    ? new RedisStore({
        sendCommand: async (...args) => {
          return await RedisClient.rateLimitSendCommand(args);
        },
        prefix: `rl:plan:${prefix}:`,
      })
    : undefined;
};

/**
 * Generates a unique key for each request to track for rate limiting.
 * It prioritizes the authenticated user's ID, falls back to a guest user ID from the body,
 * and finally uses the request's IP address for anonymous users.
 * This ensures fair usage limits per user rather than per IP, which is crucial for users behind a NAT.
 *
 * SECURITY NOTE: The `req.body.userId` for guest sessions should be a server-generated,
 * secure identifier (e.g., a UUID stored in a secure, httpOnly cookie).
 * Relying on a client-provided, mutable ID from the request body can allow users to bypass rate limits.
 *
 * @param {import('express').Request} req - The Express request object.
 * @returns {string} The identifier for the client.
 */
const keyGenerator = (req) => {
  // Prioritize authenticated user ID (assuming it's set by an auth middleware on `req.user`)
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }
  // Fallback to a validated guest userId from the body.
  if (req.body && req.body.userId) {
    // The Zod validation middleware should have already validated this is a UUID.
    return `guest:${req.body.userId}`;
  }
  // Fallback to IP address for truly anonymous users.
  return `ip:${req.ip}`;
};

/**
 * A dynamic rate limit function that applies different limits for authenticated users vs. guests/IPs.
 * @param {number} authenticatedLimit - The request limit for an authenticated user.
 * @param {number} guestLimit - The request limit for a guest or IP address.
 * @returns {(req: import('express').Request) => number} A function that returns the appropriate limit based on the request.
 */
const tieredLimit = (authenticatedLimit, guestLimit) => (req) =>
  req.user && req.user.id ? authenticatedLimit : guestLimit;

/**
 * Rate limiter for computationally expensive AI-driven operations like plan generation,
 * refinement, and brainstorming. This is a strict limit to prevent abuse and control costs.
 */
const aiLimiter = rateLimit({
  store: createRateLimitStore('ai'), // Will default to MemoryStore if redisStore is undefined.
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: tieredLimit(20, 5), // OPTIMIZATION: Use `limit` which is the current standard, `max` is legacy.
  keyGenerator,
  standardHeaders: 'draft-7', // OPTIMIZATION: Use the latest IETF draft standard for rate limit headers.
  legacyHeaders: false,
  message: {
    error: 'Too many AI-intensive requests. Please try again after an hour.',
  },
});

/**
 * Rate limiter for standard conversational/chat interactions.
 * Allows for more frequent requests than heavy AI tasks but prevents spamming.
 */
const chatLimiter = rateLimit({
  store: createRateLimitStore('chat'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: tieredLimit(100, 30),
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'You are sending messages too quickly. Please slow down.',
  },
});

/**
 * Rate limiter for resource-intensive operations like exporting files (e.g., PDF generation).
 */
const exportLimiter = rateLimit({
  store: createRateLimitStore('export'),
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: tieredLimit(10, 3),
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many export requests. Please try again after an hour.' },
});

/**
 * Rate limiter for light, data-retrieval endpoints like fetching conversation history.
 * This is more lenient but still protects against rapid, repeated requests.
 */
const dataLimiter = rateLimit({
  store: createRateLimitStore('data'),
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: tieredLimit(200, 50),
  keyGenerator,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many data requests. Please try again later.' },
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

/**
 * @typedef {object} PlanGeneratorRateLimiters
 * @property {import('express').RequestHandler} aiLimiter - Strict rate limiter for heavy AI tasks.
 * @property {import('express').RequestHandler} chatLimiter - Moderate rate limiter for conversational endpoints.
 * @property {import('express').RequestHandler} exportLimiter - Rate limiter for file export operations.
 * @property {import('express').RequestHandler} dataLimiter - Lenient rate limiter for data retrieval endpoints.
 */
/**
 * An object containing all rate-limiting middleware for the plan generator module.
 * These should be applied to the corresponding routes to prevent API abuse.
 * @type {PlanGeneratorRateLimiters}
 */
export const PlanGeneratorRateLimiters = {
  aiLimiter,
  chatLimiter,
  exportLimiter,
  dataLimiter,
};