/**
 * @fileoverview This file defines the Zod validation schemas for the forum module.
 * It ensures that the data for creating or updating forum posts conforms to the required structure and types.
 * @module app/modules/forum/forum.validation
 */

const zod = require('zod');
const { z } = zod;
const mongoose = require('mongoose');
const { categoryValues } = require('./forum.constant');

/**
 * Zod schema for validating the request body when creating or updating a forum post.
 * This schema checks for the presence, type, and format of various fields related to a forum post.
 *
 * @const {z.ZodObject<any>}
 */
const forumUserActivitiesValidationSchema = z.object({
  /**
   * Validation for the request body.
   * @type {z.ZodObject}
   */
  body: z
    .object({
      /**
       * The title of the forum post.
       * @type {z.ZodString}
       */
      title: z.string().min(3).max(100),
      /**
       * The URL of the image associated with the forum post.
       * @type {z.ZodString}
       */
      img: z
        .string()
        .refine((value) => value.trim() !== '', {
          message: 'Forum image is required',
        }),
      /**
       * The category of the forum post. Must be one of the predefined values.
       * @type {z.ZodString}
       * @see {@link module:app/modules/forum/forum.constant.categoryValues}
       */
      category: z.string().refine((value) => categoryValues.includes(value), {
        message: 'Invalid category',
      }),
      /**
       * The MongoDB ObjectId of the author of the post.
       * @type {z.ZodString}
       */
      author: z
        .string()
        // Bug Fix: Assuming 'author' refers to a MongoDB ObjectId, not a UUID.
        // The 'mongoose' import strongly suggests this is the case for a Node.js/Express backend.
        // The previous UUID validation would incorrectly reject valid MongoDB ObjectIds.
        // The .refine((value) => value.trim() !== '') check is redundant as ObjectId.isValid()
        // already handles empty or whitespace-only strings by returning false.
        .refine((value) => mongoose.Types.ObjectId.isValid(value), {
          message: 'Invalid author ID',
        }),
      /**
       * The email address of the author.
       * @type {z.ZodString}
       */
      authorEmail: z.string().email('Please provide a valid email'),
      /**
       * An array of description objects, each containing structured content for the post.
       * @type {z.ZodArray<z.ZodObject<{title: z.ZodString, content1: z.ZodString, content2: z.ZodString}>>}
       */
      description: z.array(
        z.object({
          title: z.string(),
          content1: z.string(),
          content2: z.string(),
        })
      ),
      // userActivities: z.array(z.string().uuid().refine((value) => mongoose.Types.ObjectId.isValid(value), {
      //     message: 'Invalid user activity ID',
      // })),
      /**
       * The creation timestamp of the post. Defaults to the current date and time.
       * @type {z.ZodDate}
       */
      createdAt: z.date().default(() => new Date()),
      /**
       * The last updated timestamp of the post. Defaults to the current date and time.
       * @type {z.ZodDate}
       */
      updatedAt: z.date().default(() => new Date()),
    })
    .refine((data) => data.createdAt <= data.updatedAt, {
      message: 'updatedAt must be greater than or equal to createdAt',
    }),
});

/**
 * Exports the Zod schema for validating forum post creation and updates.
 * @type {z.ZodObject<any>}
 */
module.exports = forumUserActivitiesValidationSchema;