import * as zod from 'zod';
const { z } = zod;

/**
 * A reusable Zod schema for validating UUIDs.
 * Ensures that the provided string is a valid universally unique identifier.
 * @type {z.ZodString}
 */
const uuidSchema = z.string().uuid({ message: 'Invalid ID format' });

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The natural language message or prompt for the AI to initiate or continue a conversation.
 * @property {string} [conversationId] - Optional UUID of an existing conversation to continue.
 * @property {string} [userId] - Optional guest user UUID for tracking unauthenticated conversations. For authenticated users, user context is derived from the auth token.
 * @property {'text'|'docx'|'pdf'} [outputFormat='text'] - Desired output format for the generated contract or response.
 */

/**
 * Schema for conversational contract creation requests.
 * Handles natural language interactions with an AI to draft or modify legal contracts.
 * This endpoint is subject to workspace usage limits.
 * @type {z.ZodObject<{ body: z.ZodObject<ConversationalRequestBody> }>}
 * @property {ConversationalRequestBody} body - The request body containing the conversational input.
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .trim()
      .min(1, 'Message cannot be empty')
      .max(5000, 'Message is too long. Please limit to 5000 characters.'),
    conversationId: uuidSchema.optional(),
    // For guest users. Authenticated users are identified via JWT.
    userId: uuidSchema.optional(),
    outputFormat: z.enum(['text', 'docx', 'pdf']).optional().default('text'),
  }),
});

/**
 * @typedef {object} PartySchema
 * @property {string} name - The name of the party (e.g., individual, company).
 * @property {string} role - The role of the party in the contract (e.g., 'employer', 'contractor', 'licensor').
 * @property {string} [address] - The address of the party.
 * @property {string} [email] - The email address of the party. Must be a valid email format.
 */

/**
 * @typedef {object} GenerateContractRequestBody
 * @property {'employment'|'nda'|'service_agreement'|'lease'|'sales'|'partnership'|'consulting'|'freelance'|'license'|'vendor'|'loan'|'independent_contractor'|'general'} [contractType] - The specific type of contract to generate.
 * @property {'simple'|'standard'|'detailed'|'complex'} [complexity='standard'] - The desired complexity level of the contract.
 * @property {'us_federal'|'us_state'|'uk'|'eu'|'international'|'other'} [jurisdiction='international'] - The legal jurisdiction applicable to the contract.
 * @property {'text'|'docx'|'pdf'} [outputFormat='text'] - Desired output format for the generated contract.
 * @property {PartySchema[]} [parties] - An array of parties involved in the contract, each with their details.
 * @property {Record<string, any>} [terms] - A flexible object containing contract-specific terms and clauses (e.g., `{ "salary": 50000, "startDate": "2023-01-01" }`).
 * @property {string} [additionalInstructions] - Any additional free-form instructions for contract generation.
 * @property {boolean} [includeBoilerplate=true] - Whether to include standard boilerplate clauses in the contract.
 */

/**
 * Schema for direct contract generation (non-conversational).
 * Designed for programmatic access where all contract parameters are provided explicitly.
 * This endpoint is subject to workspace usage limits.
 * @type {z.ZodObject<{ body: z.ZodObject<GenerateContractRequestBody> }>}
 * @property {GenerateContractRequestBody} body - The request body containing all parameters for direct contract generation.
 */
const generateContractSchema = z.object({
  body: z.object({
    contractType: z
      .enum([
        'employment',
        'nda',
        'service_agreement',
        'lease',
        'sales',
        'partnership',
        'consulting',
        'freelance',
        'license',
        'vendor',
        'loan',
        'independent_contractor',
        'general',
      ])
      .optional(),
    complexity: z
      .enum(['simple', 'standard', 'detailed', 'complex'])
      .optional()
      .default('standard'),
    jurisdiction: z
      .enum(['us_federal', 'us_state', 'uk', 'eu', 'international', 'other'])
      .optional()
      .default('international'),
    outputFormat: z.enum(['text', 'docx', 'pdf']).optional().default('text'),
    parties: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Party name cannot be empty'),
          role: z.string().trim().min(1, 'Party role cannot be empty'),
          address: z.string().trim().min(1).optional(),
          email: z
            .string()
            .email({ message: 'Invalid email address for party' })
            .optional(),
        })
      )
      .min(1, 'Parties array cannot be empty if provided.')
      .optional(),
    terms: z.record(z.any()).optional(), // Flexible object for contract-specific terms
    additionalInstructions: z
      .string()
      .trim()
      .min(1)
      .max(5000, 'Instructions are too long. Please limit to 5000 characters.')
      .optional(),
    includeBoilerplate: z.boolean().optional().default(true),
  }),
});

/**
 * @typedef {object} AnswerQuestionsRequestBody
 * @property {string} conversationId - The UUID of the ongoing conversation to which the answers pertain.
 * @property {Record<string, any>} answers - A map where keys are question IDs and values are the corresponding answers provided by the user.
 * @property {boolean} [requestContract=false] - If true, indicates that the user wishes to generate the contract after providing these answers.
 */

/**
 * Schema for answering AI-generated questions.
 * Used when the AI requires further information from the user to proceed with contract generation or modification.
 * @type {z.ZodObject<{ body: z.ZodObject<AnswerQuestionsRequestBody> }>}
 * @property {AnswerQuestionsRequestBody} body - The request body containing the conversation ID and user answers.
 */
const answerQuestionsSchema = z.object({
  body: z.object({
    conversationId: uuidSchema,
    answers: z.record(z.any()).refine(val => Object.keys(val).length > 0, {
      message: 'Answers object cannot be empty.',
    }),
    requestContract: z.boolean().optional().default(false),
  }),
});

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The UUID of the conversation whose history is to be retrieved.
 */

/**
 * Schema for retrieving conversation history.
 * @type {z.ZodObject<{ params: z.ZodObject<GetConversationHistoryParams> }>}
 * @property {GetConversationHistoryParams} params - The path parameters for the request.
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: uuidSchema,
  }),
});

/**
 * @typedef {object} DownloadContractParams
 * @property {string} conversationId - The UUID of the conversation associated with the contract to be downloaded.
 */

/**
 * @typedef {object} DownloadContractQuery
 * @property {'text'|'docx'|'pdf'} [format='text'] - The desired format for the contract download.
 */

/**
 * Schema for downloading a contract in different formats.
 * @type {z.ZodObject<{ params: z.ZodObject<DownloadContractParams>, query: z.ZodObject<DownloadContractQuery> }>}
 * @property {DownloadContractParams} params - The path parameters for the request.
 * @property {DownloadContractQuery} query - The query parameters for the request.
 */
const downloadContractSchema = z.object({
  params: z.object({
    conversationId: uuidSchema,
  }),
  query: z.object({
    format: z.enum(['text', 'docx', 'pdf']).optional().default('text'),
  }),
});

/**
 * @typedef {object} ModifyContractRequestBody
 * @property {string} conversationId - The UUID of the conversation associated with the contract to be modified.
 * @property {string} modifications - Natural language instructions detailing the desired modifications to the contract.
 */

/**
 * Schema for modifying an existing contract.
 * Allows users to provide instructions to the AI to alter a previously generated or drafted contract.
 * This endpoint is subject to workspace usage limits.
 * @type {z.ZodObject<{ body: z.ZodObject<ModifyContractRequestBody> }>}
 * @property {ModifyContractRequestBody} body - The request body containing the conversation ID and modification instructions.
 */
const modifyContractSchema = z.object({
  body: z.object({
    conversationId: uuidSchema,
    modifications: z
      .string({
        required_error: 'Modification instructions are required',
      })
      .trim()
      .min(1, 'Modification instructions cannot be empty')
      .max(5000, 'Modification instructions are too long. Please limit to 5000 characters.'),
  }),
});

/**
 * An object containing Zod validation schemas for various legal contract-related API endpoints.
 * These schemas are used to validate incoming request bodies, parameters, and queries, ensuring data integrity
 * and security, which is essential for features governed by workspace plans and limits.
 * @namespace LegalContractValidation
 * @property {typeof conversationalRequestSchema} conversationalRequestSchema - Schema for validating conversational contract creation requests.
 * @property {typeof generateContractSchema} generateContractSchema - Schema for validating direct contract generation requests.
 * @property {typeof answerQuestionsSchema} answerQuestionsSchema - Schema for validating requests to answer AI-generated questions.
 * @property {typeof getConversationHistorySchema} getConversationHistorySchema - Schema for validating requests to retrieve conversation history.
 * @property {typeof downloadContractSchema} downloadContractSchema - Schema for validating requests to download a contract.
 * @property {typeof modifyContractSchema} modifyContractSchema - Schema for validating requests to modify an existing contract.
 */
export const LegalContractValidation = {
  conversationalRequestSchema,
  generateContractSchema,
  answerQuestionsSchema,
  getConversationHistorySchema,
  downloadContractSchema,
  modifyContractSchema,
};

// ===================================================================================
// Admin & Workspace Management Schemas
// ===================================================================================

/**
 * @typedef {object} UpdateWorkspaceBody
 * @property {string} [name] - The new name for the workspace.
 * @property {string} [slug] - The new unique slug for the workspace. Must be URL-friendly.
 */

/**
 * Schema for updating workspace settings like name and slug.
 * Restricted to workspace owners or admins.
 * @type {z.ZodObject<{ body: z.ZodObject<UpdateWorkspaceBody> }>}
 * @property {UpdateWorkspaceBody} body - The request body containing the new workspace details.
 */
const updateWorkspaceSchema = z.object({
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(3, 'Workspace name must be at least 3 characters long.')
        .max(50, 'Workspace name must be no more than 50 characters long.')
        .optional(),
      slug: z
        .string()
        .trim()
        .min(3, 'Workspace slug must be at least 3 characters long.')
        .max(50, 'Workspace slug must be no more than 50 characters long.')
        .regex(
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
          'Slug can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'
        )
        .optional(),
    })
    .refine(data => data.name || data.slug, {
      message: 'Either name or slug must be provided for an update.',
    }),
});

/**
 * @typedef {object} CreateCheckoutSessionBody
 * @property {string} priceId - The ID of the Stripe Price object for the desired subscription plan.
 * @property {string} successUrl - The URL to redirect to upon successful payment.
 * @property {string} cancelUrl - The URL to redirect to if the user cancels the payment process.
 */

/**
 * Schema for creating a Stripe checkout session to start or change a subscription.
 * This is the first step in the billing process, setting up a new plan or changing an existing one.
 * @type {z.ZodObject<{ body: z.ZodObject<CreateCheckoutSessionBody> }>}
 * @property {CreateCheckoutSessionBody} body - The request body containing the price ID and redirect URLs.
 */
const createCheckoutSessionSchema = z.object({
  body: z.object({
    priceId: z
      .string({ required_error: 'Stripe Price ID is required.' })
      .startsWith('price_', 'Invalid Stripe Price ID format.'),
    successUrl: z.string({ required_error: 'Success URL is required.' }).url('Invalid success URL.'),
    cancelUrl: z.string({ required_error: 'Cancel URL is required.' }).url('Invalid cancel URL.'),
  }),
});

/**
 * @typedef {object} CreatePortalSessionBody
 * @property {string} [returnUrl] - The URL to redirect the user back to after they finish managing their subscription in the Stripe portal.
 */

/**
 * Schema for creating a Stripe customer portal session.
 * This allows users to securely manage their billing details, view invoices, and manage their subscription plan.
 * @type {z.ZodObject<{ body: z.ZodObject<CreatePortalSessionBody> }>}
 * @property {CreatePortalSessionBody} body - The request body containing the optional return URL.
 */
const createPortalSessionSchema = z.object({
  body: z.object({
    returnUrl: z.string().url('Invalid return URL.').optional(),
  }),
});

/**
 * An object containing Zod validation schemas for Admin and Workspace Owner features.
 * These schemas handle workspace configuration, subscription management, and billing,
 * ensuring that all administrative actions are performed with valid and secure data.
 * @namespace AdminWorkspaceValidation
 * @property {typeof updateWorkspaceSchema} updateWorkspaceSchema - Schema for updating workspace name and slug.
 * @property {typeof createCheckoutSessionSchema} createCheckoutSessionSchema - Schema for creating a Stripe checkout session to manage subscriptions and limits.
 * @property {typeof createPortalSessionSchema} createPortalSessionSchema - Schema for creating a Stripe customer portal session to manage billing settings.
 */
export const AdminWorkspaceValidation = {
  updateWorkspaceSchema,
  createCheckoutSessionSchema,
  createPortalSessionSchema,
};