import * as zod from 'zod';
const { z } = zod;

/**
 * Validation schema for conversational creative writing request
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message must be at least 1 character')
      .max(5000, 'Message must not exceed 5000 characters'),
    conversationId: z.string().optional(),
    userId: z.string().optional(),
  }),
});

/**
 * Validation schema for getting conversation history
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const CreativeWritingValidation = {
  conversationalRequestSchema,
  getConversationHistorySchema,
};
