import * as zod from 'zod';
const { z } = zod;

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The user's message or query for the conversational AI.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [userId] - Optional user ID, particularly useful for tracking guest user interactions.
 * @property {'text'|'markdown'|'pdf'|'docx'} [outputFormat='text'] - The desired format for the AI's response.
 */

/**
 * Zod schema for validating conversational AI requests.
 * Ensures the request body contains a valid message and optionally a conversation ID, user ID, and output format.
 * @type {z.ZodObject<{body: z.ZodObject<ConversationalRequestBody>}>}
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
    outputFormat: z
      .enum(['text', 'markdown', 'pdf', 'docx'])
      .optional()
      .default('text'),
  }),
});

/**
 * @typedef {object} ReviewContractRequestBody
 * @property {'general_review'|'clause_analysis'|'risk_assessment'|'compliance_check'|'fairness_evaluation'|'terminology_check'|'amendment_suggestions'|'comparison'|'summary'} [reviewType] - The specific type of review requested for the contract.
 * @property {'quick'|'standard'|'detailed'|'comprehensive'} [reviewDepth] - The desired depth or thoroughness of the contract review.
 * @property {'employment'|'nda'|'service_agreement'|'sales'|'lease'|'partnership'|'licensing'|'purchase'|'vendor'|'independent_contractor'|'franchise'|'general'} [contractType] - The type of contract being reviewed.
 * @property {Array<'obligations'|'rights'|'liabilities'|'termination'|'payment_terms'|'confidentiality'|'intellectual_property'|'indemnification'|'dispute_resolution'|'force_majeure'|'governing_law'|'warranties'|'jurisdiction'|'notice_provisions'>} [aspects] - An array of specific aspects or clauses to focus on during the review.
 * @property {string} [additionalInstructions] - Any additional free-form instructions or context for the AI reviewer.
 * @property {'text'|'markdown'|'pdf'|'docx'} [outputFormat='text'] - The desired format for the contract review output.
 */

/**
 * Zod schema for validating contract review requests.
 * Ensures the request body contains valid parameters for initiating a contract review,
 * including review type, depth, contract type, specific aspects, additional instructions, and output format.
 * @type {z.ZodObject<{body: z.ZodObject<ReviewContractRequestBody>}>}
 */
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

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The unique identifier of the conversation whose history is to be retrieved.
 */

/**
 * Zod schema for validating parameters when fetching conversation history.
 * Ensures that a required `conversationId` is provided in the request parameters.
 * @type {z.ZodObject<{params: z.ZodObject<GetConversationHistoryParams>}>}
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * An object containing Zod schemas for validating various legal contract review related requests.
 * These schemas are used to ensure incoming request data conforms to expected structures and types.
 * @exports {object} LegalContractReviewValidation
 * @property {z.ZodObject} conversationalRequestSchema - Schema for validating conversational AI requests.
 * @property {z.ZodObject} reviewContractSchema - Schema for validating contract review requests.
 * @property {z.ZodObject} getConversationHistorySchema - Schema for validating requests to get conversation history.
 */
export const LegalContractReviewValidation = {
  conversationalRequestSchema,
  reviewContractSchema,
  getConversationHistorySchema,
};