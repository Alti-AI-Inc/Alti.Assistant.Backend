/**
 * @fileoverview This file defines Zod schemas for validating video-related requests.
 * It includes schemas for video generation, conversation ID validation, and guest user ID validation.
 */

import * as zod from 'zod';
const { z } = zod;

/**
 * @typedef {object} VideoGenerationBody
 * @property {string} message - The prompt message for video generation. Minimum 3 characters, maximum 2000.
 * @property {string} [conversationId] - Optional ID of an existing conversation.
 * @property {'1:1'|'16:9'|'9:16'|'4:3'} [aspectRatio] - Optional aspect ratio for the video.
 * @property {number} [durationSeconds] - Optional desired duration of the video in seconds (1-60).
 * @property {'720p'|'1080p'} [resolution] - Optional resolution for the video.
 * @property {string} [model] - Optional model to use for video generation.
 */

/**
 * Zod schema for validating the body of a video generation request.
 * Ensures the `message` is present and within length constraints, and
 * validates optional fields like `conversationId`, `aspectRatio`, `durationSeconds`, `resolution`, and `model`.
 * @type {z.ZodObject<{body: z.ZodObject<VideoGenerationBody>}>}
 */
const videoGenerationSchema = z.object({
  body: z.object({
    message: z
      .string({ required_error: 'Video prompt is required' })
      .min(3, 'Video prompt must be at least 3 characters')
      .max(2000, 'Video prompt too long'),
    conversationId: z.string().optional(),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3']).optional(),
    durationSeconds: z.number().int().min(1).max(60).optional(),
    resolution: z.enum(['720p', '1080p']).optional(),
    model: z.string().optional(),
  }),
});

/**
 * @typedef {object} ConversationParams
 * @property {string} conversationId - The ID of the conversation, required in parameters.
 */

/**
 * Zod schema for validating requests that require a `conversationId` in the URL parameters.
 * @type {z.ZodObject<{params: z.ZodObject<ConversationParams>}>}
 */
const conversationSchema = z.object({
  params: z.object({
    conversationId: z.string({ required_error: 'Conversation ID is required' }),
  }),
});

/**
 * @typedef {object} GuestUserParams
 * @property {string} guestUserId - The ID of the guest user, required in parameters. Must be a valid 24-character hexadecimal string.
 */

/**
 * Zod schema for validating requests that require a `guestUserId` in the URL parameters.
 * Ensures the `guestUserId` is a valid 24-character hexadecimal string.
 * @type {z.ZodObject<{params: z.ZodObject<GuestUserParams>}>}
 */
const guestUserSchema = z.object({
  params: z.object({
    guestUserId: z
      .string({ required_error: 'Guest user ID is required' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid guest user ID format'),
  }),
});

/**
 * @namespace VideoValidation
 * @description An object containing all Zod validation schemas related to video operations.
 * These schemas are used to validate incoming request data (body, params, query).
 */
export const VideoValidation = {
  /**
   * Zod schema for validating the body of a video generation request.
   * @type {z.ZodObject<{body: z.ZodObject<VideoGenerationBody>}>}
   */
  videoGenerationSchema,
  /**
   * Zod schema for validating requests that require a `conversationId` in the URL parameters.
   * @type {z.ZodObject<{params: z.ZodObject<ConversationParams>}>}
   */
  conversationSchema,
  /**
   * Zod schema for validating requests that require a `guestUserId` in the URL parameters.
   * @type {z.ZodObject<{params: z.ZodObject<GuestUserParams>}>}
   */
  guestUserSchema,
};