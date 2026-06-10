/**
 * @fileoverview Defines Zod validation schemas for support ticket operations.
 * @module app/modules/support/support.validation
 * @requires zod - A TypeScript-first schema declaration and validation library.
 */

import { z } from 'zod';

/**
 * @const {z.ZodObject} supportValidationSchema
 * @description A Zod schema for validating the body and URL parameters of support ticket requests.
 * This schema is typically used in middleware to ensure data integrity before it reaches the controller.
 *
 * @property {z.ZodObject} body - Validates the request body.
 * @property {string} body.subject - The subject of the support ticket. Must be a non-empty string.
 * @property {string} body.message - The main content/message of the support ticket. Must be a non-empty string.
 * @property {z.ZodEnum} [body.status] - The status of the ticket. Optional. Must be one of 'open', 'pending', or 'closed'.
 * @property {boolean} [body.isRead] - Flag indicating if the ticket has been read. Optional.
 *
 * @property {z.ZodObject} params - Validates the URL parameters.
 * @property {string} params.id - The MongoDB ObjectId of the support ticket. Must match the 24-character hex string format.
 * This prevents invalid IDs from reaching the database layer, improving security and error handling.
 */
export const supportValidationSchema = z.object({
  body: z.object({
    //   // userId: z.string({
    //   //   required_error: 'User ID is required',
    //   // }),
    subject: z.string().min(1, 'Subject is required'),
    message: z.string().min(1, 'Message is required'),
    status: z.enum(['open', 'pending', 'closed']).optional(),
    isRead: z.boolean().optional(),
  }),
  params: z.object({
    // Validate URL parameter 'id' to ensure it's a valid MongoDB ObjectId format.
    // This prevents invalid IDs from reaching the database layer, improving security and error handling.
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format'),
  }),
});