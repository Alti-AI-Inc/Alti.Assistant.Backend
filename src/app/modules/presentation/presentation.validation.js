/**
 * @file This file defines Zod schemas for validating request bodies and parameters
 *       related to presentation generation, conversational interactions, and management
 *       within the Alti.Assistant backend. These schemas are used by middleware
 *       to ensure incoming data conforms to expected structures and types.
 * @module PresentationValidation
 */

import * as zod from 'zod';
const { z } = zod;

/**
 * @typedef {object} ConversationalRequestBody
 * @property {string} message - The user's message for the conversational interaction.
 * @property {string} [conversationId] - Optional ID of an ongoing conversation.
 * @property {string} [userId] - Optional ID of the user, primarily for guest users.
 */

/**
 * Zod schema for validating conversational request bodies.
 * @type {z.ZodObject<{body: z.ZodObject<ConversationalRequestBody>}>}
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    /**
     * The user's message for the conversational interaction.
     * @type {string}
     */
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(5000, 'Message too long'),
    /**
     * Optional ID of an ongoing conversation.
     * @type {string}
     */
    conversationId: z.string().optional(),
    /**
     * Optional ID of the user, primarily for guest users.
     * @type {string}
     */
    userId: z.string().optional(), // For guest users
  }),
});

/**
 * @typedef {object} GeneratePresentationRequestBody
 * @property {string} content - The main content or topic for which the presentation should be generated.
 * @property {number} [n_slides] - Optional number of slides to generate (between 1 and 50).
 * @property {string} [language] - Optional language for the presentation (e.g., 'en', 'es').
 * @property {string} [template] - Optional template to use for the presentation.
 * @property {string} [theme] - Optional theme to apply to the presentation.
 * @property {'pptx'|'pdf'} [export_as] - Optional desired export format for the presentation.
 * @property {string} [tone] - Optional tone of the presentation (e.g., 'formal', 'casual').
 * @property {string} [verbosity] - Optional verbosity level for the presentation content.
 * @property {string} [image_type] - Optional type of images to include (e.g., 'abstract', 'realistic').
 * @property {boolean} [web_search] - Optional flag indicating whether to perform a web search for content.
 * @property {boolean} [include_table_of_contents] - Optional flag indicating whether to include a table of contents.
 * @property {boolean} [include_title_slide] - Optional flag indicating whether to include a title slide.
 * @property {boolean} [async] - Optional flag indicating whether the presentation generation should be processed asynchronously.
 */

/**
 * Zod schema for validating requests to generate a new presentation.
 * @type {z.ZodObject<{body: z.ZodObject<GeneratePresentationRequestBody>}>}
 */
const generatePresentationSchema = z.object({
  body: z.object({
    /**
     * The main content or topic for which the presentation should be generated.
     * @type {string}
     */
    content: z.string().min(1, 'Content is required'),
    /**
     * Optional number of slides to generate. Must be between 1 and 50.
     * @type {number}
     */
    n_slides: z.number().min(1).max(50).optional(),
    /**
     * Optional language for the presentation (e.g., 'en', 'es').
     * @type {string}
     */
    language: z.string().optional(),
    /**
     * Optional template to use for the presentation.
     * @type {string}
     */
    template: z.string().optional(),
    /**
     * Optional theme to apply to the presentation.
     * @type {string}
     */
    theme: z.string().optional(),
    /**
     * Optional desired export format for the presentation.
     * @type {'pptx'|'pdf'}
     */
    export_as: z.enum(['pptx', 'pdf']).optional(),
    /**
     * Optional tone of the presentation (e.g., 'formal', 'casual').
     * @type {string}
     */
    tone: z.string().optional(),
    /**
     * Optional verbosity level for the presentation content.
     * @type {string}
     */
    verbosity: z.string().optional(),
    /**
     * Optional type of images to include (e.g., 'abstract', 'realistic').
     * @type {string}
     */
    image_type: z.string().optional(),
    /**
     * Optional flag indicating whether to perform a web search for content.
     * @type {boolean}
     */
    web_search: z.boolean().optional(),
    /**
     * Optional flag indicating whether to include a table of contents.
     * @type {boolean}
     */
    include_table_of_contents: z.boolean().optional(),
    /**
     * Optional flag indicating whether to include a title slide.
     * @type {boolean}
     */
    include_title_slide: z.boolean().optional(),
    /**
     * Optional flag indicating whether the presentation generation should be processed asynchronously.
     * @type {boolean}
     */
    async: z.boolean().optional(),
  }),
});

/**
 * @typedef {object} CheckStatusParams
 * @property {string} taskId - The ID of the asynchronous task whose status is to be checked.
 */

/**
 * @typedef {object} CheckStatusQuery
 * @property {string} [conversationId] - Optional ID of the conversation associated with the task.
 */

/**
 * Zod schema for validating requests to check the status of an asynchronous task.
 * @type {z.ZodObject<{params: z.ZodObject<CheckStatusParams>, query?: z.ZodObject<CheckStatusQuery>}>}
 */
const checkStatusSchema = z.object({
  params: z.object({
    /**
     * The ID of the asynchronous task whose status is to be checked.
     * @type {string}
     */
    taskId: z.string({
      required_error: 'Task ID is required',
    }),
  }),
  query: z
    .object({
      /**
       * Optional ID of the conversation associated with the task.
       * @type {string}
       */
      conversationId: z.string().optional(),
    })
    .optional(),
});

/**
 * @typedef {object} SlideEdit
 * @property {number} index - The zero-based index of the slide to be edited.
 * @property {Record<string, any>} content - The new content for the slide. This can be any object structure.
 */

/**
 * @typedef {object} EditPresentationRequestBody
 * @property {string} presentationId - The ID of the presentation to be edited.
 * @property {SlideEdit[]} slides - An array of slide edits, each specifying an index and new content. At least one slide edit is required.
 * @property {'pptx'|'pdf'} [export_as] - Optional desired export format for the presentation after editing.
 */

/**
 * Zod schema for validating requests to edit an existing presentation.
 * @type {z.ZodObject<{body: z.ZodObject<EditPresentationRequestBody>}>}
 */
const editPresentationSchema = z.object({
  body: z.object({
    /**
     * The ID of the presentation to be edited.
     * @type {string}
     */
    presentationId: z.string({
      required_error: 'Presentation ID is required',
    }),
    /**
     * An array of slide edits, each specifying an index and new content.
     * At least one slide edit is required.
     * @type {SlideEdit[]}
     */
    slides: z
      .array(
        z.object({
          /**
           * The zero-based index of the slide to be edited.
           * @type {number}
           */
          index: z.number().min(0),
          /**
           * The new content for the slide. This can be any object structure.
           * @type {Record<string, any>}
           */
          content: z.record(z.any()),
        })
      )
      .min(1, 'At least one slide edit is required'),
    /**
     * Optional desired export format for the presentation after editing.
     * @type {'pptx'|'pdf'}
     */
    export_as: z.enum(['pptx', 'pdf']).optional(),
  }),
});

/**
 * @typedef {object} GetPresentationParams
 * @property {string} presentationId - The ID of the presentation to retrieve.
 */

/**
 * Zod schema for validating requests to retrieve a specific presentation.
 * @type {z.ZodObject<{params: z.ZodObject<GetPresentationParams>}>}
 */
const getPresentationSchema = z.object({
  params: z.object({
    /**
     * The ID of the presentation to retrieve.
     * @type {string}
     */
    presentationId: z.string({
      required_error: 'Presentation ID is required',
    }),
  }),
});

/**
 * An object consolidating all Zod validation schemas related to presentation operations.
 * These schemas are used to validate incoming request data for various presentation-related endpoints.
 * @exports PresentationValidation
 * @property {typeof conversationalRequestSchema} conversationalRequestSchema - Schema for validating conversational requests.
 * @property {typeof generatePresentationSchema} generatePresentationSchema - Schema for validating presentation generation requests.
 * @property {typeof checkStatusSchema} checkStatusSchema - Schema for validating task status check requests.
 * @property {typeof editPresentationSchema} editPresentationSchema - Schema for validating presentation edit requests.
 * @property {typeof getPresentationSchema} getPresentationSchema - Schema for validating requests to get a specific presentation.
 */
export const PresentationValidation = {
  conversationalRequestSchema,
  generatePresentationSchema,
  checkStatusSchema,
  editPresentationSchema,
  getPresentationSchema,
};