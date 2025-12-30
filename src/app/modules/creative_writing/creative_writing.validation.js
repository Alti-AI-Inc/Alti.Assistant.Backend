import Joi from 'joi';

/**
 * Validation schema for conversational creative writing request
 */
const conversationalRequestSchema = {
  body: Joi.object({
    message: Joi.string().required().min(1).max(5000).messages({
      'string.empty': 'Message is required',
      'string.min': 'Message must be at least 1 character',
      'string.max': 'Message must not exceed 5000 characters',
      'any.required': 'Message is required',
    }),
    conversationId: Joi.string().optional().allow(null, '').messages({
      'string.base': 'Conversation ID must be a string',
    }),
    userId: Joi.string().optional().messages({
      'string.base': 'User ID must be a string',
    }),
  }),
};

/**
 * Validation schema for getting conversation history
 */
const getConversationHistorySchema = {
  params: Joi.object({
    conversationId: Joi.string().required().messages({
      'string.empty': 'Conversation ID is required',
      'any.required': 'Conversation ID is required',
    }),
  }),
};

export const CreativeWritingValidation = {
  conversationalRequestSchema,
  getConversationHistorySchema,
};
