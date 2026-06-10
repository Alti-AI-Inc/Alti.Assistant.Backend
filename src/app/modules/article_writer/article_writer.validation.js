/**
 * @file This file defines Zod schemas for validating requests related to the article writer module.
 * It includes schemas for conversational article generation, direct article writing, and fetching conversation history.
 * @module ArticleWriterValidation
 */

import { z } from 'zod';

// Common schemas for article parameters to ensure consistency and avoid repetition.
const articleParameters = {
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
};

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The user's message or prompt for the conversational article generation.
 *   Required, must be between 1 and 15000 characters.
 * @property {string} [conversationId] - Optional UUID of an existing conversation to continue.
 * @property {string} [userId] - Optional UUID of the user, primarily for guest users.
 * @property {'blog_post'|'news_article'|'technical_article'|'opinion_piece'|'how_to_guide'|'listicle'|'case_study'|'research_article'|'general'} [articleType] - Optional desired type of article.
 * @property {'professional'|'casual'|'formal'|'conversational'|'persuasive'|'informative'|'entertaining'|'academic'} [tone] - Optional desired tone of the article.
 * @property {'short'|'medium'|'long'|'comprehensive'} [length] - Optional desired length of the article.
 */

/**
 * Zod schema for validating conversational article generation requests.
 * Expects a `body` object conforming to {@link ConversationalRequestBody}.
 * @type {z.ZodObject<{ body: z.ZodObject<any> }>}
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .trim() // Prevent submissions with only whitespace.
      .min(1, 'Message cannot be empty')
      .max(15000, 'Message exceeds the maximum length of 15,000 characters.'), // Set a clear limit for prompts.
    conversationId: z.string().uuid('Invalid conversation ID format.').optional(),
    userId: z.string().uuid('Invalid user ID format.').optional(), // For guest users, enforce UUID to ensure data integrity.
    ...articleParameters,
  }),
});

/**
 * @typedef {object} WriteArticleRequestBody
 * @property {string} [topic] - Optional topic for the article. Max 500 characters.
 * @property {string} [content] - Optional initial content or prompt for the article. Max 15000 characters.
 * @property {'blog_post'|'news_article'|'technical_article'|'opinion_piece'|'how_to_guide'|'listicle'|'case_study'|'research_article'|'general'} [articleType] - Optional desired type of article.
 * @property {'professional'|'casual'|'formal'|'conversational'|'persuasive'|'informative'|'entertaining'|'academic'} [tone] - Optional desired tone of the article.
 * @property {'short'|'medium'|'long'|'comprehensive'} [length] - Optional desired length of the article.
 * @property {string} [userId] - Optional UUID of the user, primarily for guest users.
 */

/**
 * Zod schema for validating direct article writing requests.
 * Expects a `body` object conforming to {@link WriteArticleRequestBody}.
 * At least one of `topic` or `content` must be provided to ensure a valid prompt.
 * @type {z.ZodObject<{ body: z.ZodObject<any> }>}
 */
const writeArticleSchema = z.object({
  body: z
    .object({
      topic: z
        .string()
        .trim()
        .min(1)
        .max(500, 'Topic exceeds the maximum length of 500 characters.')
        .optional(),
      content: z
        .string()
        .trim()
        .min(1)
        .max(15000, 'Content exceeds the maximum length of 15,000 characters.')
        .optional(),
      userId: z.string().uuid('Invalid user ID format.').optional(), // For guest users
      ...articleParameters,
    })
    // Ensure that the user provides a prompt, improving UX by preventing empty requests.
    .refine((data) => !!data.topic || !!data.content, {
      message: 'Either a topic or content must be provided to generate an article.',
      path: ['topic'], // Associate error with a field for better client-side error handling.
    }),
});

/**
 * @typedef {object} GetConversationHistoryParams
 * @property {string} conversationId - The UUID of the conversation whose history is to be retrieved. Required.
 */

/**
 * Zod schema for validating requests to get conversation history.
 * Expects `params` object conforming to {@link GetConversationHistoryParams}.
 * @type {z.ZodObject<{ params: z.ZodObject<any> }>}
 */
const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z
      .string({
        required_error: 'Conversation ID is required',
      })
      .uuid('Invalid Conversation ID format.'), // Enforce UUID format for security and data integrity.
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