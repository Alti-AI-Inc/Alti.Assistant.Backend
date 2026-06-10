import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { presentationController } from './presentation.controller.js';
import { PresentationValidation } from './presentation.validation.js';

/**
 * @swagger
 * tags:
 *   name: Presentation
 *   description: API for managing and generating presentations
 */

/**
 * @constant {express.Router} router - Express router for presentation routes.
 */
const router = express.Router();

/**
 * @swagger
 * /api/v1/presentation/assistant:
 *   post:
 *     summary: Conversational assistant endpoint
 *     description: Main entry point for natural language requests to the presentation assistant. Supports both authenticated and guest users.
 *     tags: [Presentation, Assistant]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConversationalRequest'
 *     responses:
 *       200:
 *         description: Successful response from the assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Assistant response generated successfully"
 *                 data:
 *                   type: object
 *                   description: The assistant's response or generated content.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(20, 15), // 20 requests per 15 minutes - Re-enabled for security/performance
  validateRequest(PresentationValidation.conversationalRequestSchema),
  presentationController.conversationalAssistant
);

/**
 * @swagger
 * /api/v1/presentation/generate:
 *   post:
 *     summary: Direct presentation generation
 *     description: Generates a presentation programmatically based on provided parameters, without conversational interaction.
 *     tags: [Presentation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GeneratePresentationRequest'
 *     responses:
 *       200:
 *         description: Presentation generation initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Presentation generation initiated"
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskId:
 *                       type: string
 *                       description: ID of the asynchronous task for status checking.
 *                       example: "65e8a2b0f8d4e5c6b7a8d9e0"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(10, 15), // 10 generations per 15 minutes - Re-enabled for security/performance
  validateRequest(PresentationValidation.generatePresentationSchema),
  presentationController.generatePresentation
);

/**
 * @swagger
 * /api/v1/presentation/status/{taskId}:
 *   get:
 *     summary: Check asynchronous task status
 *     description: Retrieves the current status of a previously initiated asynchronous task, such as presentation generation.
 *     tags: [Presentation, Tasks]
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the asynchronous task to check.
 *     responses:
 *       200:
 *         description: Task status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Task status retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [pending, processing, completed, failed]
 *                       example: "completed"
 *                     result:
 *                       type: object
 *                       description: The result of the task if completed, e.g., presentation details.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get(
  '/status/:taskId',
  optionalAuth(),
  extractTenantContext,
  createRateLimiter(60, 1), // 60 requests per minute to prevent polling abuse
  validateRequest(PresentationValidation.checkStatusSchema),
  presentationController.checkTaskStatus
);

/**
 * @swagger
 * /api/v1/presentation/edit:
 *   post:
 *     summary: Edit existing presentation
 *     description: Modifies an existing presentation based on the provided editing parameters.
 *     tags: [Presentation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EditPresentationRequest'
 *     responses:
 *       200:
 *         description: Presentation edited successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Presentation updated successfully"
 *                 data:
 *                   type: object
 *                   description: The updated presentation details.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/edit',
  optionalAuth(),
  extractTenantContext, // Added for tenant-specific authorization and IDOR prevention
  createRateLimiter(15, 15), // 15 edits per 15 minutes - Re-enabled for security/performance
  validateRequest(PresentationValidation.editPresentationSchema),
  presentationController.editPresentation
);

/**
 * @swagger
 * /api/v1/presentation/derive:
 *   post:
 *     summary: Derive new presentation from existing one
 *     description: Creates a new presentation by using an existing presentation as a base, applying new modifications or parameters.
 *     tags: [Presentation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EditPresentationRequest' # Reusing schema as it's similar to edit
 *     responses:
 *       200:
 *         description: New presentation derived successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "New presentation derived successfully"
 *                 data:
 *                   type: object
 *                   description: The details of the newly derived presentation.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.post(
  '/derive',
  optionalAuth(),
  extractTenantContext, // Added for tenant-specific authorization and IDOR prevention
  createRateLimiter(15, 15), // 15 derivations per 15 minutes - Re-enabled for security/performance
  validateRequest(PresentationValidation.editPresentationSchema), // Same schema as edit
  presentationController.derivePresentation
);

/**
 * @swagger
 * /api/v1/presentation/{presentationId}:
 *   get:
 *     summary: Get presentation details
 *     description: Retrieves the full details of a specific presentation by its unique ID.
 *     tags: [Presentation]
 *     parameters:
 *       - in: path
 *         name: presentationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the presentation to retrieve.
 *     responses:
 *       200:
 *         description: Presentation details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Presentation retrieved successfully"
 *                 data:
 *                   type: object
 *                   description: The full details of the requested presentation.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
router.get(
  '/:presentationId',
  optionalAuth(),
  extractTenantContext, // Added for tenant-specific authorization and IDOR prevention
  createRateLimiter(60, 5), // 60 requests per 5 minutes to prevent scraping
  validateRequest(PresentationValidation.getPresentationSchema),
  presentationController.getPresentation
);

export default router;