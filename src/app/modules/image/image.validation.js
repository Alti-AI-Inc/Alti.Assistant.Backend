/**
 * @file This file defines Zod schemas for validating various image-related requests and data
 *       within the Alti.Assistant backend. These schemas are used to ensure that incoming
 *       request bodies, parameters, and file uploads conform to expected structures and constraints.
 * @module ImageValidation
 * @author Alti.Assistant Backend Team
 */

import * as zod from 'zod';
const { z } = zod;

/**
 * @openapi
 * components:
 *   schemas:
 *     ImageGenerationRequest:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: The prompt message for generating the image.
 *           minLength: 3
 *           maxLength: 2000
 *           example: "A futuristic city at sunset with flying cars."
 *         conversationId:
 *           type: string
 *           description: Optional ID of the conversation associated with this image generation.
 *           example: "65e8a2b1c3d4e5f6a7b8c9d0"
 *         imageSize:
 *           type: string
 *           enum: [small, standard, large]
 *           description: The desired size of the generated image.
 *           default: standard
 *         imageStyle:
 *           type: string
 *           enum: [realistic, cartoon, abstract, photorealistic]
 *           description: The artistic style for the generated image.
 *           default: photorealistic
 *         imageModel:
 *           type: string
 *           description: Optional specific model to use for image generation.
 *           example: "dall-e-3"
 */
/**
 * Zod schema for validating image generation requests.
 * Ensures the request body contains a valid prompt message and optional parameters
 * like conversation ID, image size, style, and model.
 *
 * @type {z.ZodObject<{
 *   body: z.ZodObject<{
 *     message: z.ZodString,
 *     conversationId: z.ZodOptional<z.ZodString>,
 *     imageSize: z.ZodOptional<z.ZodEnum<['small', 'standard', 'large']>>,
 *     imageStyle: z.ZodOptional<z.ZodEnum<['realistic', 'cartoon', 'abstract', 'photorealistic']>>,
 *     imageModel: z.ZodOptional<z.ZodString>
 *   }>
 * }>}
 */
const imageGenerationSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Image prompt is required',
      })
      .min(3, 'Image prompt must be at least 3 characters')
      .max(2000, 'Image prompt too long'),
    conversationId: z.string().optional(),
    imageSize: z.enum(['small', 'standard', 'large']).optional(),
    imageStyle: z
      .enum(['realistic', 'cartoon', 'abstract', 'photorealistic'])
      .optional(),
    imageModel: z.string().optional(),
  }),
});

/**
 * @openapi
 * components:
 *   schemas:
 *     ImageAnalysisRequest:
 *       type: object
 *       required:
 *         - imageData
 *       properties:
 *         imageData:
 *           type: string
 *           description: Base64 encoded image data for analysis.
 *           minLength: 1
 *           example: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
 *         message:
 *           type: string
 *           description: Optional prompt or question related to the image analysis.
 *           minLength: 1
 *           maxLength: 1000
 *           example: "Describe the main objects in this image."
 *         conversationId:
 *           type: string
 *           description: Optional ID of the conversation associated with this image analysis.
 *           example: "65e8a2b1c3d4e5f6a7b8c9d0"
 *         analysisType:
 *           type: string
 *           enum: [describe, extract_text, detect_objects, identify_style, compare]
 *           description: The type of analysis to perform on the image.
 *           default: describe
 */
/**
 * Zod schema for validating image analysis requests.
 * Ensures the request body contains required image data (Base64 encoded) and
 * optional parameters like a message, conversation ID, and analysis type.
 *
 * @type {z.ZodObject<{
 *   body: z.ZodObject<{
 *     imageData: z.ZodString,
 *     message: z.ZodOptional<z.ZodString>,
 *     conversationId: z.ZodOptional<z.ZodString>,
 *     analysisType: z.ZodOptional<z.ZodEnum<['describe', 'extract_text', 'detect_objects', 'identify_style', 'compare']>>
 *   }>
 * }>}
 */
const imageAnalysisSchema = z.object({
  body: z.object({
    imageData: z
      .string({
        required_error: 'Image data is required for analysis',
      })
      .min(1, 'Image data cannot be empty'),
    message: z.string().min(1).max(1000).optional(),
    conversationId: z.string().optional(),
    analysisType: z
      .enum([
        'describe',
        'extract_text',
        'detect_objects',
        'identify_style',
        'compare',
      ])
      .optional(),
  }),
});

/**
 * @openapi
 * components:
 *   schemas:
 *     ImagePreferencesRequest:
 *       type: object
 *       properties:
 *         size:
 *           type: string
 *           enum: [small, standard, large]
 *           description: Preferred default image size.
 *         style:
 *           type: string
 *           enum: [realistic, cartoon, abstract, photorealistic]
 *           description: Preferred default image style.
 *         aspectRatio:
 *           type: string
 *           enum: ["1:1", "3:4", "4:3", "16:9"]
 *           description: Preferred default image aspect ratio.
 *         quality:
 *           type: string
 *           enum: [standard, high]
 *           description: Preferred default image quality.
 */
/**
 * Zod schema for validating image preferences updates.
 * Allows updating various user preferences related to image generation,
 * such as size, style, aspect ratio, and quality. All fields are optional,
 * allowing partial updates.
 *
 * @type {z.ZodObject<{
 *   body: z.ZodObject<{
 *     size: z.ZodOptional<z.ZodEnum<['small', 'standard', 'large']>>,
 *     style: z.ZodOptional<z.ZodEnum<['realistic', 'cartoon', 'abstract', 'photorealistic']>>,
 *     aspectRatio: z.ZodOptional<z.ZodEnum<['1:1', '3:4', '4:3', '16:9']>>,
 *     quality: z.ZodOptional<z.ZodEnum<['standard', 'high']>>
 *   }>
 * }>}
 */
const imagePreferencesSchema = z.object({
  body: z.object({
    size: z.enum(['small', 'standard', 'large']).optional(),
    style: z
      .enum(['realistic', 'cartoon', 'abstract', 'photorealistic'])
      .optional(),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '16:9']).optional(),
    quality: z.enum(['standard', 'high']).optional(),
  }),
});

/**
 * Zod schema for validating headers related to guest user rate limiting.
 * This schema is intended for future enhancements to manage guest user requests.
 * It checks for optional 'x-guest-id' and 'x-forwarded-for' headers.
 *
 * @type {z.ZodObject<{
 *   headers: z.ZodOptional<z.ZodObject<{
 *     'x-guest-id': z.ZodOptional<z.ZodString>,
 *     'x-forwarded-for': z.ZodOptional<z.ZodString>
 *   }>>
 * }>}
 */
const guestRateLimitSchema = z.object({
  headers: z
    .object({
      'x-guest-id': z.string().optional(),
      'x-forwarded-for': z.string().optional(),
    })
    .optional(),
});

/**
 * @openapi
 * components:
 *   schemas:
 *     ImageFile:
 *       type: object
 *       required:
 *         - mimetype
 *         - size
 *       properties:
 *         mimetype:
 *           type: string
 *           description: The MIME type of the uploaded image file.
 *           enum: [image/png, image/jpeg, image/jpg, image/gif, image/bmp, image/webp]
 *           example: "image/jpeg"
 *         size:
 *           type: number
 *           format: int64
 *           description: The size of the uploaded image file in bytes. Maximum 10MB.
 *           maximum: 10485760
 *           example: 1234567
 */
/**
 * Zod schema for validating uploaded image files, typically from `req.file` (e.g., via Multer).
 * Ensures the file has a valid MIME type (PNG, JPEG, GIF, BMP, WebP) and does not exceed 10MB in size.
 *
 * @type {z.ZodObject<{
 *   mimetype: z.ZodString,
 *   size: z.ZodNumber
 * }>}
 */
const imageFileSchema = z.object({
  mimetype: z
    .string({
      required_error: 'Image mimetype is required.',
    })
    .refine(
      (type) =>
        [
          'image/png',
          'image/jpeg',
          'image/jpg',
          'image/gif',
          'image/bmp',
          'image/webp',
        ].includes(type),
      'Invalid image format. Only PNG, JPEG, GIF, BMP, and WebP are allowed.'
    ),
  size: z
    .number({
      required_error: 'Image size is required.',
    })
    .max(10 * 1024 * 1024, 'Image file too large. Maximum size is 10MB.'),
});

/**
 * @openapi
 * components:
 *   parameters:
 *     conversationIdParam:
 *       name: conversationId
 *       in: path
 *       required: true
 *       description: The unique identifier of the conversation.
 *       schema:
 *         type: string
 *         example: "65e8a2b1c3d4e5f6a7b8c9d0"
 */
/**
 * Zod schema for validating conversation ID in request parameters.
 * Ensures that a `conversationId` is present in the `params` object.
 *
 * @type {z.ZodObject<{
 *   params: z.ZodObject<{
 *     conversationId: z.ZodString
 *   }>
 * }>}
 */
const conversationSchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

/**
 * @openapi
 * components:
 *   parameters:
 *     guestUserIdParam:
 *       name: guestUserId
 *       in: path
 *       required: true
 *       description: The unique identifier of the guest user (24-character hex string).
 *       schema:
 *         type: string
 *         pattern: '^[0-9a-fA-F]{24}$'
 *         example: "65e8a2b1c3d4e5f6a7b8c9d0"
 */
/**
 * Zod schema for validating guest user ID in request parameters.
 * Ensures that a `guestUserId` is present in the `params` object and
 * matches a 24-character hexadecimal format (MongoDB ObjectId format).
 *
 * @type {z.ZodObject<{
 *   params: z.ZodObject<{
 *     guestUserId: z.ZodString
 *   }>
 * }>}
 */
const guestUserSchema = z.object({
  params: z.object({
    guestUserId: z
      .string({
        required_error: 'Guest user ID is required',
      })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid guest user ID format'),
  }),
});

/**
 * Zod schema for validating GCS upload signed URL requests.
 */
const generateUploadUrlSchema = z.object({
  body: z.object({
    contentType: z
      .string({
        required_error: 'Content type is required',
      })
      .regex(/^[\w-]+\/[\w-+\.]+$/, 'Invalid content type format'),
    guestUserId: z.string().optional(),
  }),
});

/**
 * @namespace ImageValidation
 * @description A collection of Zod schemas used for validating various image-related
 *              requests and data throughout the Alti.Assistant backend.
 *              These schemas ensure data integrity and proper request formatting.
 */
export const ImageValidation = {
  /**
   * Zod schema for validating image generation requests.
   * @see imageGenerationSchema
   */
  imageGenerationSchema,
  /**
   * Zod schema for validating image analysis requests.
   * @see imageAnalysisSchema
   */
  imageAnalysisSchema,
  /**
   * Zod schema for validating GCS signed upload URL requests.
   */
  generateUploadUrlSchema,
  /**
   * Zod schema for validating image preferences updates.
   * @see imagePreferencesSchema
   */
  imagePreferencesSchema,
  /**
   * Zod schema for validating headers related to guest user rate limiting.
   * @see guestRateLimitSchema
   */
  guestRateLimitSchema,
  /**
   * Zod schema for validating uploaded image files.
   * @see imageFileSchema
   */
  imageFileSchema,
  /**
   * Zod schema for validating conversation ID in request parameters.
   * @see conversationSchema
   */
  conversationSchema,
  /**
   * Zod schema for validating guest user ID in request parameters.
   * @see guestUserSchema
   */
  guestUserSchema,
};