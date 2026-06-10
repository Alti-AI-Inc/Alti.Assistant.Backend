import * as zod from 'zod';
const { z } = zod;

/**
 * @description Zod schema for validating the request body for generating a new image.
 */
const generateImageSchema = z.object({
  body: z.object({
    /**
     * The main text prompt describing the image to be generated.
     * @type {string}
     */
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
    /**
     * Optional ID for an existing conversation.
     * @type {string|undefined}
     */
    conversationId: z.string().optional(),
    /**
     * Optional aspect ratio for the generated image (e.g., '1:1', '16:9').
     * @type {string|undefined}
     */
    aspectRatio: z.string().optional(),
    /**
     * Optional text describing what to avoid in the image.
     * @type {string|undefined}
     */
    negativePrompt: z.string().optional(),
    /**
     * Optional ID of the user making the request.
     * @type {string|undefined}
     */
    userId: z.string().optional(),
  }),
});

/**
 * @description Zod schema for validating the request body for editing an existing image.
 * This schema expects the client to have already uploaded the image to GCS via a signed URL.
 */
const editImageSchema = z.object({
  body: z.object({
    /**
     * The text prompt describing the edits to be made.
     * @type {string}
     */
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
    /**
     * The path/name of the image file in the GCS bucket to be edited.
     * The client is expected to first request a signed URL, upload the file directly
     * to GCS, and then provide the resulting file path in this field.
     * @type {string}
     */
    gcsImagePath: z
      .string({
        required_error: 'GCS image path is required',
      })
      .min(1, 'GCS image path cannot be empty'),
    /**
     * Optional ID for an existing conversation.
     * @type {string|undefined}
     */
    conversationId: z.string().optional(),
    /**
     * Optional aspect ratio for the edited image.
     * @type {string|undefined}
     */
    aspectRatio: z.string().optional(),
    /**
     * Optional ID of the user making the request.
     * @type {string|undefined}
     */
    userId: z.string().optional(),
  }),
});

/**
 * @description Zod schema for validating the request body for analyzing user intent from a text prompt.
 */
const analyzeIntentSchema = z.object({
  body: z.object({
    /**
     * The user's text prompt to analyze.
     * @type {string}
     */
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
  }),
});

/**
 * @description Zod schema for validating the request body for analyzing user intent in a multi-modal context.
 * It requires either a 'request' or 'userMessage' to be present.
 */
const analyzeImageIntentSchema = z.object({
  body: z
    .object({
      /**
       * Optional user request string.
       * @type {string|undefined}
       */
      request: z.string().optional(),
      /**
       * Optional user message string.
       * @type {string|undefined}
       */
      userMessage: z.string().optional(),
      /**
       * Optional boolean indicating if an image is part of the context.
       * @type {boolean|undefined}
       */
      hasImage: z.boolean().optional(),
      /**
       * Optional session ID.
       * @type {string|undefined}
       */
      sessionId: z.string().optional(),
      /**
       * Optional conversation ID.
       * @type {string|undefined}
       */
      conversationId: z.string().optional(),
    })
    .refine((data) => data.request || data.userMessage, {
      message: 'Either request or userMessage is required',
    }),
});

/**
 * @description Zod schema for validating the request body for evaluating a user's prompt.
 */
const evaluatePromptSchema = z.object({
  body: z.object({
    /**
     * The user's text prompt to be evaluated.
     * @type {string}
     */
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
    /**
     * Optional ID for an existing conversation.
     * @type {string|undefined}
     */
    conversationId: z.string().optional(),
  }),
});

/**
 * @description Zod schema for validating the request body for adding a detail to an image generation conversation.
 */
const addDetailSchema = z.object({
  body: z.object({
    /**
     * The ID of the conversation to which the detail is being added.
     * @type {string}
     */
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
    /**
     * The specific detail to add to the conversation.
     * @type {string}
     */
    detail: z
      .string({
        required_error: 'Detail is required',
      })
      .min(1, 'Detail cannot be empty')
      .max(2000, 'Detail too long'),
  }),
});

/**
 * @description Zod schema for validating the request body for building an enhanced prompt from a conversation.
 */
const buildEnhancedPromptSchema = z.object({
  body: z.object({
    /**
     * The ID of the conversation from which to build the enhanced prompt.
     * @type {string}
     */
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
  }),
});

/**
 * @description Zod schema for validating the request body for finalizing a prompt from a conversation.
 */
const finalizePromptSchema = z.object({
  body: z.object({
    /**
     * The ID of the conversation to finalize.
     * @type {string}
     */
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
  }),
});

/**
 * @description Zod schema for validating the request body for generating an image from a conversation.
 */
const generateFromConversationSchema = z.object({
  body: z.object({
    /**
     * The ID of the conversation containing the finalized prompt.
     * @type {string}
     */
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
    /**
     * Optional aspect ratio for the generated image.
     * @type {string|undefined}
     */
    aspectRatio: z.string().optional(),
    /**
     * Optional text describing what to avoid in the image.
     * @type {string|undefined}
     */
    negativePrompt: z.string().optional(),
    /**
     * Optional ID of the user making the request.
     * @type {string|undefined}
     */
    userId: z.string().optional(),
  }),
});

/**
 * @description A collection of Zod schemas for validating requests in the Enhanced Image module.
 * These schemas are used by middleware to ensure the integrity of incoming request data.
 * @property {object} generateImageSchema - Schema for generating a new image.
 * @property {object} editImageSchema - Schema for editing an existing image.
 * @property {object} analyzeIntentSchema - Schema for analyzing user intent from text.
 * @property {object} analyzeImageIntentSchema - Schema for analyzing user intent in a multi-modal context.
 * @property {object} evaluatePromptSchema - Schema for evaluating a user's prompt.
 * @property {object} addDetailSchema - Schema for adding a detail to a conversation.
 * @property {object} finalizePromptSchema - Schema for finalizing a prompt from a conversation.
 * @property {object} buildEnhancedPromptSchema - Schema for building an enhanced prompt from a conversation.
 * @property {object} generateFromConversationSchema - Schema for generating an image from a conversation.
 */
export const EnhancedImageValidation = {
  generateImageSchema,
  editImageSchema,
  analyzeIntentSchema,
  analyzeImageIntentSchema,
  evaluatePromptSchema,
  addDetailSchema,
  finalizePromptSchema,
  buildEnhancedPromptSchema,
  generateFromConversationSchema,
};