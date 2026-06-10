/**
 * @fileoverview This file defines the Zod validation schema for task-related data.
 * It ensures that task objects conform to a predefined structure and data types
 * before being processed, typically in a Node.js/Express backend.
 * @module notesValidation
 */

const { z } = require('zod');

/**
 * @typedef {object} TaskInput
 * @property {string} [title] - The title of the task. Must be a string between 1 and 255 characters.
 * @property {string} [description] - A description of the task. Must be a string between 0 and 1000 characters.
 * @property {'Pending'|'In Progress'|'Completed'} [status] - The current status of the task.
 * @property {Date} [createdAt] - The date and time when the task was created.
 * @property {Date|null} [updatedAt] - The date and time when the task was last updated, or null if never updated.
 * @property {string} [userId] - The ID of the user associated with the task.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     TaskInput:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           minLength: 1
 *           maxLength: 255
 *           description: The title of the task.
 *         description:
 *           type: string
 *           maxLength: 1000
 *           description: A description of the task.
 *         status:
 *           type: string
 *           enum: [Pending, In Progress, Completed]
 *           description: The current status of the task.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date and time when the task was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: The date and time when the task was last updated.
 *         userId:
 *           type: string
 *           description: The ID of the user associated with the task (Multi-tenant owner identifier).
 */

/**
 * Zod validation schema for task objects.
 * This schema defines the structure and validation rules for task data,
 * ensuring data integrity for task creation and updates.
 *
 * Multi-tenant / Role Context:
 * - `userId` is validated as a string to enforce ownership boundaries.
 * - Operations using this schema should ensure the requesting user's ID matches the `userId`
 *   or that the user has administrative privileges to modify tasks across tenants.
 *
 * @type {import('zod').ZodObject<
 *   {
 *     title: import('zod').ZodOptional<import('zod').ZodString>;
 *     description: import('zod').ZodOptional<import('zod').ZodString>;
 *     status: import('zod').ZodOptional<import('zod').ZodEnum<['Pending', 'In Progress', 'Completed']>>;
 *     createdAt: import('zod').ZodOptional<import('zod').ZodDate>;
 *     updatedAt: import('zod').ZodOptional<import('zod').ZodNullable<import('zod').ZodDate>>;
 *     userId: import('zod').ZodOptional<import('zod').ZodString>;
 *   }
 * >}
 */
const taskValidationSchema = z.object({
  /**
   * The title of the task.
   * - Must be a string.
   * - Required error message if missing: 'Title is required'.
   * - Minimum length: 1 character.
   * - Maximum length: 255 characters.
   * - Optional.
   * @type {import('zod').ZodOptional<import('zod').ZodString>}
   */
  title: z
    .string({
      required_error: 'Title is required',
    })
    .min(1)
    .max(255)
    .optional(),
  /**
   * A description of the task.
   * - Must be a string.
   * - Minimum length: 0 characters.
   * - Maximum length: 1000 characters.
   * - Optional.
   * @type {import('zod').ZodOptional<import('zod').ZodString>}
   */
  description: z.string().min(0).max(1000).optional(),
  /**
   * The current status of the task.
   * - Must be one of 'Pending', 'In Progress', or 'Completed'.
   * - Required error message if missing: 'Status is required'.
   * - Optional.
   * @type {import('zod').ZodOptional<import('zod').ZodEnum<['Pending', 'In Progress', 'Completed']>>}
   */
  status: z
    .enum(['Pending', 'In Progress', 'Completed'], {
      required_error: 'Status is required',
    })
    .optional(),
  /**
   * The date and time when the task was created.
   * - Must be a Date object.
   * - Optional.
   * @type {import('zod').ZodOptional<import('zod').ZodDate>}
   */
  createdAt: z.date().optional(),
  /**
   * The date and time when the task was last updated.
   * - Must be a Date object or null.
   * - Optional.
   * @type {import('zod').ZodOptional<import('zod').ZodNullable<import('zod').ZodDate>>}
   */
  updatedAt: z.date().nullable().optional(),
  /**
   * The ID of the user associated with the task.
   * - Must be a string.
   * - Optional.
   * @type {import('zod').ZodOptional<import('zod').ZodString>}
   */
  userId: z.string().optional(),
});

/**
 * Exported Zod validation schema for validating task payloads.
 * @type {import('zod').ZodObject}
 */
module.exports = taskValidationSchema;