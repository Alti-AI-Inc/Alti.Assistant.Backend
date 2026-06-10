import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { enhancedImageController } from './enhanced_image.controller.js';
import { EnhancedImageValidation } from './enhanced_image.validation.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';

const router = express.Router();

/**
 * @openapi
 * /enhanced-image/generate:
 *   post:
 *     summary: Generate an image directly from a prompt
 *     description: >
 *       Creates an image based on a user-provided text prompt.
 *       This endpoint is open to all users. Authenticated users will have their usage tracked against their daily limits and tenant context.
 *       Unauthenticated users are subject to stricter rate limiting and daily limits based on their IP address.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateImageSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the generated image data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           base64:
 *                             type: string
 *                             format: byte
 *                             description: The generated image encoded in Base64.
 *                           seed:
 *                             type: integer
 *                             description: The seed used for image generation.
 *                     revised_prompt:
 *                       type: string
 *                       description: The prompt that was actually used for generation, which may have been revised by the model for better results.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 image generation requests per 15 minutes - Re-enabled rate limiting
  validateRequest(EnhancedImageValidation.generateImageSchema),
  enhancedImageController.generateImageDirect
);

/**
 * @openapi
 * /enhanced-image/edit:
 *   post:
 *     summary: Edit an existing image using a prompt
 *     description: >
 *       Modifies a base image (provided as a Base64 string) according to a text prompt.
 *       This endpoint is open to all users. Authenticated users will have their usage tracked.
 *       Unauthenticated users are subject to stricter rate limiting and daily limits.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EditImageSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the edited image data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           base64:
 *                             type: string
 *                             format: byte
 *                             description: The edited image encoded in Base64.
 *                           seed:
 *                             type: integer
 *                             description: The seed used for image generation.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/edit',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 image editing requests per 15 minutes - Re-enabled rate limiting
  validateRequest(EnhancedImageValidation.editImageSchema),
  enhancedImageController.editImage
);

/**
 * @openapi
 * /enhanced-image/analyze-intent:
 *   post:
 *     summary: Analyze user intent for image generation
 *     description: >
 *       Takes a user's initial idea or prompt and uses an LLM to analyze the intent, breaking it down into key components (like subject, style, composition).
 *       This is a preliminary step in the guided prompt creation flow and is open to all users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnalyzeIntentSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the analyzed components of the user's intent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The analyzed intent data.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/analyze-intent',
  optionalAuth(), // SECURE: Enable user-specific rate limiting and context for authenticated users.
  extractTenantContext,
  createRateLimiter(30, 15), // Rate limit intent analysis to prevent LLM cost runaway
  validateRequest(EnhancedImageValidation.analyzeIntentSchema),
  enhancedImageController.analyzeIntent
);

/**
 * @openapi
 * /enhanced-image/analyze-image-intent:
 *   post:
 *     summary: Analyze an image to understand its content and style
 *     description: >
 *       Performs a multimodal analysis on a provided image to extract its subject, style, composition, and other visual elements.
 *       This can be used to generate similar images or as a starting point for editing.
 *       This endpoint is open to all users, with usage tracking for authenticated users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnalyzeImageIntentSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the analysis results of the image.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The analyzed image intent data.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/analyze-image-intent',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // Rate limit expensive multimodal image analysis
  validateRequest(EnhancedImageValidation.analyzeImageIntentSchema), // Re-enabled validation
  enhancedImageController.analyzeImageIntent
);

/**
 * @openapi
 * /enhanced-image/evaluate-prompt:
 *   post:
 *     summary: Evaluate the quality of an image generation prompt
 *     description: >
 *       Assesses a given prompt for clarity, detail, and effectiveness in generating a high-quality image.
 *       Provides feedback and suggestions for improvement.
 *       This endpoint is open to all users, with usage tracking for authenticated users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EvaluatePromptSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns feedback on the prompt's quality.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The evaluation feedback.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/evaluate-prompt',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(30, 15), // Rate limit prompt evaluation LLM calls
  validateRequest(EnhancedImageValidation.evaluatePromptSchema), // Re-enabled validation
  enhancedImageController.evaluatePrompt
);

/**
 * @openapi
 * /enhanced-image/add-detail:
 *   post:
 *     summary: Add detail to a prompt-building conversation
 *     description: >
 *       Takes an existing conversation history (related to building a prompt) and a new user message,
 *       and integrates the new detail into the conversation, re-evaluating the prompt components.
 *       This endpoint is open to all users, with usage tracking for authenticated users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddDetailSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the updated conversation/prompt components.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The updated conversation state.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/add-detail',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(30, 15), // Rate limit conversation detail additions
  validateRequest(EnhancedImageValidation.addDetailSchema),
  enhancedImageController.addDetail
);

/**
 * @openapi
 * /enhanced-image/finalize-prompt:
 *   post:
 *     summary: Finalize and build an enhanced prompt from a conversation
 *     description: >
 *       Consolidates a conversation history into a final, detailed, and optimized prompt suitable for an image generation model.
 *       This is a key step in the guided prompt creation flow.
 *       This endpoint is open to all users, with usage tracking for authenticated users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FinalizePromptSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the finalized, enhanced prompt string.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     prompt:
 *                       type: string
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/finalize-prompt',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // Rate limit prompt finalization LLM calls
  validateRequest(EnhancedImageValidation.finalizePromptSchema),
  enhancedImageController.finalizePrompt
);

/**
 * @openapi
 * /enhanced-image/build-enhanced-prompt:
 *   post:
 *     summary: Build an enhanced prompt from a conversation
 *     description: >
 *       Similar to `/finalize-prompt`, this endpoint builds a detailed prompt from a conversation history.
 *       It might represent a different LLM strategy or flow.
 *       This endpoint is open to all users, with usage tracking for authenticated users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuildEnhancedPromptSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the built, enhanced prompt string.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     prompt:
 *                       type: string
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/build-enhanced-prompt',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // Rate limit prompt building LLM calls
  validateRequest(EnhancedImageValidation.buildEnhancedPromptSchema),
  enhancedImageController.buildEnhancedPrompt
);

/**
 * @openapi
 * /enhanced-image/generate-from-conversation:
 *   post:
 *     summary: Generate an image from a conversation history
 *     description: >
 *       Takes a full conversation history, builds a final prompt from it, and then generates an image.
 *       This combines the finalization and generation steps into a single API call.
 *       This endpoint is open to all users, with usage tracking for authenticated users.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateFromConversationSchema'
 *     responses:
 *       '200':
 *         description: OK. Returns the generated image data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           base64:
 *                             type: string
 *                             format: byte
 *                             description: The generated image encoded in Base64.
 *                           seed:
 *                             type: integer
 *                             description: The seed used for image generation.
 *                     revised_prompt:
 *                       type: string
 *                       description: The prompt that was actually used for generation.
 *       '400':
 *         $ref: '#/components/responses/BadRequest'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/generate-from-conversation',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // Re-enabled rate limiting
  validateRequest(EnhancedImageValidation.generateFromConversationSchema),
  enhancedImageController.generateFromConversation
);

/**
 * @openapi
 * /enhanced-image/stats:
 *   get:
 *     summary: Get image generation statistics
 *     description: >
 *       Retrieves statistics about image generation usage.
 *       - **USER role**: Returns personal usage statistics for the current user within their tenant.
 *       - **ADMIN role**: Returns tenant-wide or system-wide statistics (depending on implementation).
 *       Requires authentication.
 *     tags:
 *       - Enhanced Image
 *     security:
 *       - bearerAuth:
 *         - "ADMIN"
 *         - "USER"
 *     responses:
 *       '200':
 *         description: OK. Returns usage statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The usage statistics data.
 *       '401':
 *         $ref: '#/components/responses/Unauthorized'
 *       '403':
 *         $ref: '#/components/responses/Forbidden'
 *       '429':
 *         $ref: '#/components/responses/TooManyRequests'
 *       '500':
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  extractTenantContext,
  createRateLimiter(100, 15), // Rate limit stats queries to prevent DB abuse
  enhancedImageController.getImageStats
);

/**
 * Express router for enhanced image generation and manipulation functionalities.
 * @type {express.Router}
 */
export const enhancedImageRoute = router;