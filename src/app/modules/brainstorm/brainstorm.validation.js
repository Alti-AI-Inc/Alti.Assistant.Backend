/**
 * @module BrainstormValidation
 * @description This module defines Zod schemas for validating various brainstorm-related API requests.
 * It ensures that incoming data for conversational brainstorms, structured brainstorms,
 * conversation history retrieval, brainstorm export, and brainstorm refinement
 * adheres to predefined structures and constraints.
 */
import { z } from 'zod';

/**
 * @constant {z.ZodObject} conversationalBrainstormSchema
 * @description Zod schema for validating the request body of a conversational brainstorm initiation or continuation.
 * @property {object} body - The request body.
 * @property {string} body.message - The user's message for the conversational brainstorm.
 *   Must be between 10 and 5000 characters.
 * @property {string} [body.conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [body.workspaceId] - Optional ID of the workspace to associate the conversation with. Enforces tenant context.
 */
const conversationalBrainstormSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(10, 'Message must be at least 10 characters')
      .max(5000, 'Message cannot exceed 5000 characters'),
    conversationId: z.string().cuid('Invalid Conversation ID format').optional(),
    workspaceId: z.string().cuid('Invalid Workspace ID format').optional(),
    // SECURITY FIX: Removed `userId` field. Client-provided user identifiers are a severe security risk (IDOR/impersonation).
    // User identity MUST be determined from a secure, server-managed session or token (e.g., req.user from JWT middleware).
    // This prevents any user from performing actions on behalf of another.
  }),
});

/**
 * @constant {z.ZodObject} structuredBrainstormSchema
 * @description Zod schema for validating the request body of a structured brainstorm initiation.
 * @property {object} body - The request body.
 * @property {string} body.workspaceId - The ID of the workspace where the brainstorm will be created. Required for tenant context.
 * @property {string} body.idea - The core idea or problem statement for the structured brainstorm.
 *   Must be between 10 and 2000 characters.
 * @property {('product_idea'|'business_strategy'|'marketing_campaign'|'technical_solution'|'creative_content'|'problem_solving'|'process_improvement'|'general')} [body.brainstormType] - The type of brainstorm.
 * @property {Array<('business'|'technical'|'creative'|'user_centric'|'strategic'|'operational'|'financial'|'competitive')>} [body.perspective] - Specific perspectives to consider during the brainstorm.
 * @property {('scamper'|'mind_map'|'six_thinking_hats'|'swot'|'five_whys'|'reverse_brainstorm'|'brainwriting'|'free_association'|'starbursting'|'role_storming')} [body.technique] - A specific brainstorming technique to apply.
 * @property {('quick'|'standard'|'deep'|'comprehensive')} [body.depth] - The desired depth of the brainstorm.
 * @property {number} [body.iterations] - The number of iterations for the brainstorm process (1-5).
 * @property {Array<('innovation'|'feasibility'|'marketability'|'scalability'|'uniqueness'|'profitability'|'user_value'|'sustainability')>} [body.focusAreas] - Specific areas to focus on.
 * @property {object} [body.constraints] - Optional constraints for the brainstorm.
 * @property {string} [body.constraints.budget] - Budget constraints.
 * @property {string} [body.constraints.timeline] - Timeline constraints.
 * @property {string[]} [body.constraints.technology] - Technology constraints.
 * @property {string} [body.constraints.targetAudience] - Target audience constraints.
 * @property {string} [body.constraints.industry] - Industry constraints.
 * @property {string[]} [body.constraints.competitors] - Competitor considerations.
 * @property {string} [body.additionalInstructions] - Any additional instructions for the AI, max 1000 characters.
 */
const structuredBrainstormSchema = z.object({
  body: z.object({
    // INTEGRATION FIX: Added workspaceId to ensure all new resources are explicitly tied to a tenant.
    // The controller must validate that the authenticated user has permissions for this workspace.
    workspaceId: z
      .string({ required_error: 'Workspace ID is required' })
      .cuid('Invalid Workspace ID format'),
    idea: z
      .string({
        required_error: 'Idea is required',
      })
      .min(10, 'Idea must be at least 10 characters')
      .max(2000, 'Idea description cannot exceed 2000 characters'),
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
      // OPTIMIZATION: Added limits to prevent abuse (e.g., sending an array with thousands of items) and improve UX.
      .min(1, 'At least one perspective is required if the field is provided')
      .max(5, 'You can select a maximum of 5 perspectives')
      .optional()
      .describe('Specific perspectives to guide the brainstorm'),
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
    // OPTIMIZATION: Added .int() to ensure whole numbers, preventing invalid inputs like 2.5 iterations.
    iterations: z.number().int().min(1).max(5).optional(),
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
      // OPTIMIZATION: Added limits to prevent abuse and improve UX.
      .min(1, 'At least one focus area is required if the field is provided')
      .max(5, 'You can select a maximum of 5 focus areas')
      .optional()
      .describe('Key areas to concentrate the brainstorming effort on'),
    constraints: z
      .object({
        // OPTIMIZATION: Added length constraints to free-text fields to prevent overly long inputs.
        budget: z.string().min(3).max(250).optional(),
        timeline: z.string().min(3).max(250).optional(),
        technology: z
          .array(z.string().min(1).max(100))
          .min(1)
          .max(10)
          .optional(),
        targetAudience: z.string().min(3).max(500).optional(),
        industry: z.string().min(3).max(250).optional(),
        competitors: z
          .array(z.string().min(1).max(100))
          .min(1)
          .max(10)
          .optional(),
      })
      .optional(),
    additionalInstructions: z
      .string()
      .max(1000, 'Additional instructions cannot exceed 1000 characters')
      .optional(),
  }),
});

/**
 * @constant {z.ZodObject} getConversationHistorySchema
 * @description Zod schema for validating the request parameters when fetching conversation history.
 * @property {object} params - The request parameters.
 * @property {string} params.workspaceId - The ID of the workspace containing the conversation. Prevents cross-tenant IDOR.
 * @property {string} params.conversationId - The ID of the conversation whose history is to be retrieved.
 *   This field is required.
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    // SECURITY FIX: Added workspaceId to the route parameters to enforce tenant boundaries.
    // This prevents Insecure Direct Object Reference (IDOR) vulnerabilities across different workspaces.
    // The API route should be structured like /api/workspaces/:workspaceId/conversations/:conversationId
    workspaceId: z
      .string({ required_error: 'Workspace ID is required' })
      .cuid('Invalid Workspace ID format'),
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .cuid('Invalid Conversation ID format'),
  }),
});

/**
 * @constant {z.ZodObject} exportBrainstormSchema
 * @description Zod schema for validating the request body when exporting a brainstorm conversation.
 * @property {object} body - The request body.
 * @property {string} body.workspaceId - The ID of the workspace containing the conversation. Enforces tenant context.
 * @property {string} body.conversationId - The ID of the conversation to be exported. This field is required.
 * @property {('json'|'markdown'|'pdf'|'html')} [body.format='markdown'] - The desired export format. Defaults to 'markdown'.
 * @property {boolean} [body.includeHistory=true] - Whether to include the full conversation history in the export. Defaults to true.
 */
const exportBrainstormSchema = z.object({
  body: z.object({
    // SECURITY FIX: Added workspaceId to scope the request to a specific tenant.
    // The controller must validate that the conversationId belongs to this workspaceId and the user has access.
    workspaceId: z
      .string({ required_error: 'Workspace ID is required' })
      .cuid('Invalid Workspace ID format'),
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .cuid('Invalid Conversation ID format'),
    format: z
      .enum(['json', 'markdown', 'pdf', 'html'])
      .optional()
      .default('markdown'),
    includeHistory: z.boolean().optional().default(true),
  }),
});

/**
 * @constant {z.ZodObject} refineBrainstormSchema
 * @description Zod schema for validating the request body when refining an existing brainstorm.
 * @property {object} body - The request body.
 * @property {string} body.workspaceId - The ID of the workspace containing the conversation. Enforces tenant context.
 * @property {string} body.conversationId - The ID of the conversation to refine. This field is required.
 * @property {string} body.message - The refinement instruction or new input for the brainstorm.
 *   Must be between 10 and 2000 characters.
 * @property {string[]} [body.focusOn] - Specific ideas or aspects within the brainstorm to focus on for refinement.
 */
const refineBrainstormSchema = z.object({
  body: z.object({
    // SECURITY FIX: Added workspaceId to scope the request to a specific tenant.
    // This prevents a user from one workspace from refining a conversation in another.
    workspaceId: z
      .string({ required_error: 'Workspace ID is required' })
      .cuid('Invalid Workspace ID format'),
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .cuid('Invalid Conversation ID format'),
    // OPTIMIZATION: Added consistent required_error message and more specific max length message.
    message: z
      .string({ required_error: 'Refinement message is required' })
      .min(10, 'Message must be at least 10 characters')
      .max(2000, 'Message cannot exceed 2000 characters'),
    focusOn: z
      // OPTIMIZATION: Added limits to array size and string length to prevent abuse.
      .array(
        z
          .string()
          .min(1)
          .max(250, 'Each focus item cannot exceed 250 characters')
      )
      .min(1, 'At least one focus item is required if the field is provided')
      .max(10, 'You can provide a maximum of 10 focus items')
      .optional()
      .describe('Specific ideas or aspects to focus on'),
  }),
});

/**
 * @namespace BrainstormValidation
 * @description An object consolidating all Zod validation schemas related to brainstorm operations.
 * This allows for easy access and organization of validation rules throughout the application.
 */
export const BrainstormValidation = {
  conversationalBrainstormSchema,
  structuredBrainstormSchema,
  getConversationHistorySchema,
  exportBrainstormSchema,
  refineBrainstormSchema,
};