/**
 * @module TranslationValidation
 * @description This module provides Zod schemas for validating translation-related API requests.
 * It includes schemas for conversational requests, text translation, and language detection.
 */
import * as zod from 'zod';
const { z } = zod;

/**
 * @constant {z.ZodObject} conversationalRequestSchema
 * @description Zod schema for validating conversational translation requests.
 * It ensures that the request body contains a message, and optionally a conversation ID and user ID.
 * @property {z.ZodObject} body - The request body object.
 * @property {z.ZodString} body.message - The message to be translated or processed conversationally.
 *   - Must be a string.
 *   - Is required.
 *   - Minimum length: 1 character.
 *   - Maximum length: 50,000 characters.
 * @property {z.ZodOptional<z.ZodString>} [body.conversationId] - Optional ID of the ongoing conversation.
 *   - Must be a string if provided.
 * @property {z.ZodOptional<z.ZodString>} [body.userId] - Optional ID of the user, primarily for guest users.
 *   - Must be a string if provided.
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(50000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
  }),
});

/**
 * @constant {z.ZodObject} translateTextSchema
 * @description Zod schema for validating text translation requests.
 * It ensures that the request body contains the text to translate and the target language,
 * with optional source language and formatting preservation.
 * @property {z.ZodObject} body - The request body object.
 * @property {z.ZodString} body.text - The text content to be translated.
 *   - Must be a string.
 *   - Is required.
 *   - Minimum length: 1 character.
 *   - Maximum length: 100,000 characters.
 * @property {z.ZodString} body.targetLanguage - The language code (e.g., 'en', 'es') to translate the text into.
 *   - Must be a string.
 *   - Is required.
 * @property {z.ZodOptional<z.ZodString>} [body.sourceLanguage] - Optional language code of the source text.
 *   - If not provided, the source language will be automatically detected.
 *   - Must be a string if provided.
 * @property {z.ZodOptional<z.ZodBoolean>} [body.preserveFormatting] - Optional flag to indicate whether to preserve original text formatting.
 *   - Must be a boolean if provided.
 */
const translateTextSchema = z.object({
  body: z.object({
    text: z
      .string({
        required_error: 'Text is required',
      })
      .min(1, 'Text cannot be empty')
      .max(100000, 'Text exceeds 100,000 character limit'),
    targetLanguage: z.string({
      required_error: 'Target language is required',
    }),
    sourceLanguage: z.string().optional(),
    preserveFormatting: z.boolean().optional(),
  }),
});

/**
 * @constant {z.ZodObject} detectLanguageSchema
 * @description Zod schema for validating language detection requests.
 * It ensures that the request body contains the text for which to detect the language.
 * @property {z.ZodObject} body - The request body object.
 * @property {z.ZodString} body.text - The text content for which to detect the language.
 *   - Must be a string.
 *   - Is required.
 *   - Minimum length: 1 character.
 *   - Maximum length: 10,000 characters.
 */
const detectLanguageSchema = z.object({
  body: z.object({
    text: z
      .string({
        required_error: 'Text is required',
      })
      .min(1, 'Text cannot be empty')
      .max(10000, 'Text too long for language detection'),
  }),
});

/**
 * @namespace TranslationValidation
 * @description An object containing all Zod validation schemas for translation-related operations.
 * These schemas are used to validate incoming request bodies for various translation API endpoints.
 */
export const TranslationValidation = {
  conversationalRequestSchema,
  translateTextSchema,
  detectLanguageSchema,
};