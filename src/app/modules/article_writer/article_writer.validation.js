/**
 * @file This file defines Zod schemas for validating requests related to the article writer module.
 * It includes schemas for conversational article generation, direct article writing, and fetching conversation history.
 * @module ArticleWriterValidation
 */

import * as zod from 'zod';
const { z } = zod;

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The user's message or prompt for the conversational article generation.
 *   Required, must be between 1 and 10000 characters.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [userId] - Optional ID of the user, primarily for guest users.
 * @property {'blog_post'|'news_article'|'technical_article'|'opinion_piece'|'how_to_guide'|'listicle'|'case_study'|'research_article'|'general'} [articleType] - Optional desired type of article.
 * @property {'professional'|'casual'|'formal'|'conversational'|'persuasive'|'informative'|'entertaining'|'academic'} [tone] - Optional desired tone of the article.
 * @property {'short'|'medium'|'long'|'comprehensive'} [length] - Optional desired length of the article.
 */

/**
 * Zod schema for validating conversational article generation requests.
 * Expects a `body` object conforming to {@link ConversationalRequestBody}.
 * @type {z.ZodObject<{ body: z.ZodObject<ConversationalRequestBody> }>}
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(10000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
    articleType: z
      .enum([
        'blog_post',
        'news_article',
        'technical_article',
        'opinion_piece',
        'how_to_guide',
        'listicle',
        'case_study',
        'research_article',
        'general',
      ])
      .optional(),
    tone: z
      .enum([
        'professional',
        'casual',
        'formal',
        'conversational',
        'persuasive',
        'informative',
        'entertaining',
        'academic',
      ])
      .optional(),
    length: z.enum(['short', 'medium', 'long', 'comprehensive']).optional(),
  }),
});

/**
 * @typedef {object} WriteArticleRequestBody
 * @property {string} [topic] - Optional topic for the article.
 * @property {string} [content] - Optional initial content or prompt for the article.
 * @property {'blog_post'|'news_article'|'technical_article'|'opinion_piece'|'how_to_guide'|'listicle'|'case_study'|'research_article'|'general'} [articleType] - Optional desired type of article.
 * @property {'professional'|'casual'|'formal'|'conversational'|'persuasive'|'informative'|'entertaining'|'academic'} [tone] - Optional desired tone of the article.
 * @property {'short'|'medium'|'long'|'comprehensive'} [length] - Optional desired length of the article.
 * @property {string} [userId] - Optional ID of the user, primarily for guest users.
 */

/**
 * Zod schema for validating direct article writing requests.
 * Expects a `body` object conforming to {@link WriteArticleRequestBody}.
 * @type {z.ZodObject<{ body: z.ZodObject<WriteArticleRequestBody> }>}
 */
const writeArticleSchema = z.object({
  body: z.object({
    topic: z.string().optional(),
    content: z.string().optional(),
    articleType: z
      .enum([
        'blog_post',
        'news_article',
        'technical_article',
        'opinion_piece',
        'how_to_guide',
        'listicle',
        'case_study',
        'research_article',
        'general',
      ])
      .optional(),
    tone: z
      .enum([
        'professional',
        'casual',
        'formal',
        'conversational',
        'persuasive',
        'informative',
        'entertaining',
        'academic',
      ])
      .optional(),
    length: z.enum(['short', 'medium', 'long', 'comprehensive']).optional(),
    userId: z.string().optional(), // For guest users
  }),
});

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The ID of the conversation whose history is to be retrieved. Required.
 */

/**
 * Zod schema for validating requests to get conversation history.
 * Expects `params` object conforming to {@link GetConversationHistoryParams}.
 * @type {z.ZodObject<{ params: z.ZodObject<GetConversationHistoryParams> }>}
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * An object containing all Zod validation schemas for the article writer module.
 * @property {typeof conversationalRequestSchema} conversationalRequestSchema - Schema for conversational article generation requests.
 * @property {typeof writeArticleSchema} writeArticleSchema - Schema for direct article writing requests.
 * @property {typeof getConversationHistorySchema} getConversationHistorySchema - Schema for fetching conversation history requests.
 */
export const ArticleWriterValidation = {
  conversationalRequestSchema,
  writeArticleSchema,
  getConversationHistorySchema,
};