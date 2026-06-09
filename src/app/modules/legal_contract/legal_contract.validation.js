import * as zod from 'zod';
const { z } = zod;

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The natural language message or prompt for the AI to initiate or continue a conversation.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [userId] - Optional user ID, primarily for guest users or tracking.
 * @property {'text'|'docx'|'pdf'} [outputFormat='text'] - Desired output format for the generated contract or response.
 */

/**
 * Schema for conversational contract creation requests.
 * Handles natural language interactions with an AI to draft or modify legal contracts.
 * @type {z.ZodObject<{ body: z.ZodObject<ConversationalRequestBody> }>}
 * @property {ConversationalRequestBody} body - The request body containing the conversational input.
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
 * @property {Record<string, any>} [terms] - A flexible object containing contract-specific terms and clauses (e.g., `{ salary: '50000', startDate: '2023-01-01' }`).
 * @property {string} [additionalInstructions] - Any additional free-form instructions for contract generation.
 * @property {boolean} [includeBoilerplate=true] - Whether to include standard boilerplate clauses in the contract.
 */

/**
 * Schema for direct contract generation (non-conversational).
 * Designed for programmatic access where all contract parameters are provided explicitly.
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
          name: z.string(),
          role: z.string(), // e.g., 'employer', 'contractor', 'party1', etc.
          address: z.string().optional(),
          email: z.string().email().optional(),
        })
      )
      .optional(),
    terms: z.record(z.any()).optional(), // Flexible object for contract-specific terms
    additionalInstructions: z.string().optional(),
    includeBoilerplate: z.boolean().optional().default(true),
  }),
});

/**
 * @typedef {object} AnswerQuestionsRequestBody
 * @property {string} conversationId - The ID of the ongoing conversation to which the answers pertain.
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
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
    answers: z.record(z.any()), // Map of questionId -> answer
    requestContract: z.boolean().optional().default(false), // If true, generate contract after answers
  }),
});

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The ID of the conversation whose history is to be retrieved.
 */

/**
 * Schema for retrieving conversation history.
 * @type {z.ZodObject<{ params: z.ZodObject<GetConversationHistoryParams> }>}
 * @property {GetConversationHistoryParams} params - The path parameters for the request.
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * @typedef {object} DownloadContractParams
 * @property {string} conversationId - The ID of the conversation associated with the contract to be downloaded.
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
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
  query: z.object({
    format: z.enum(['text', 'docx', 'pdf']).optional().default('text'),
  }),
});

/**
 * @typedef {object} ModifyContractRequestBody
 * @property {string} conversationId - The ID of the conversation associated with the contract to be modified.
 * @property {string} modifications - Natural language instructions detailing the desired modifications to the contract.
 */

/**
 * Schema for modifying an existing contract.
 * Allows users to provide instructions to the AI to alter a previously generated or drafted contract.
 * @type {z.ZodObject<{ body: z.ZodObject<ModifyContractRequestBody> }>}
 * @property {ModifyContractRequestBody} body - The request body containing the conversation ID and modification instructions.
 */
const modifyContractSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
    modifications: z.string({
      required_error: 'Modification instructions are required',
    }),
  }),
});

/**
 * An object containing Zod validation schemas for various legal contract-related API endpoints.
 * These schemas are used to validate incoming request bodies, parameters, and queries.
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