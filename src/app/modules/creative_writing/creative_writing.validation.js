import * as zod from 'zod';
const { z } = zod;

/**
 * Zod validation schema for the body of a conversational creative writing request.
 * This schema defines the expected structure and constraints for the input
 * when initiating or continuing a creative writing conversation. It ensures
 * that the user's message is valid and allows for optional conversation and user IDs.
 *
 * @property {object} body - The request body object.
 * @property {string} body.message - The user's message or prompt for the creative writing.
 *   Must be a string between 1 and 5000 characters. This field is required.
 * @property {string} [body.conversationId] - Optional ID of an existing conversation to continue.
 *   If provided, the creative writing will be contextualized within this conversation.
 * @property {string} [body.userId] - Optional ID of the user initiating the request.
 *   Used for tracking or personalization purposes.
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
 * Zod validation schema for the parameters of a request to retrieve conversation history.
 * This schema ensures that the necessary `conversationId` is provided in the request parameters
 * when attempting to fetch the history of a specific creative writing conversation.
 *
 * @property {object} params - The request parameters object.
 * @property {string} params.conversationId - The unique identifier of the conversation whose history is to be retrieved.
 *   This field is required and must be a string.
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * @module CreativeWritingValidation
 * @description A collection of Zod validation schemas specifically designed for
 * validating input data related to creative writing features within the application.
 * These schemas ensure that incoming request bodies, parameters, and queries
 * conform to expected structures and data types, enhancing data integrity and security
 * for creative writing operations.
 *
 * @property {typeof conversationalRequestSchema} conversationalRequestSchema - Schema for validating conversational creative writing requests.
 * @property {typeof getConversationHistorySchema} getConversationHistorySchema - Schema for validating requests to get conversation history.
 */
export const CreativeWritingValidation = {
  conversationalRequestSchema,
  getConversationHistorySchema,
};