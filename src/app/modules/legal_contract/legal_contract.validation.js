import * as zod from 'zod';
const { z } = zod;

/**
 * Schema for conversational contract creation requests
 * Handles natural language interactions with AI
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
 * Schema for direct contract generation (non-conversational)
 * For programmatic access with all parameters provided
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
 * Schema for answering AI-generated questions
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
 * Schema for retrieving conversation history
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * Schema for downloading contract in different formats
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
 * Schema for modifying existing contract
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

export const LegalContractValidation = {
  conversationalRequestSchema,
  generateContractSchema,
  answerQuestionsSchema,
  getConversationHistorySchema,
  downloadContractSchema,
  modifyContractSchema,
};
