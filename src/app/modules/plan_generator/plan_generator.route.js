import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { planGeneratorController } from './plan_generator.controller.js';
import { PlanGeneratorValidation } from './plan_generator.validation.js';
import { uploadPlanFiles } from './middlewares/uploadPlanFiles.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// Helper function to wrap async controller functions and catch errors.
// This prevents unhandled promise rejections from crashing the server
// and ensures errors are passed to the Express error handling middleware.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const router = express.Router();

/**
 * @swagger
 * /api/v1/plan-generator/assistant:
 *   post:
 *     summary: Conversational AI Assistant
 *     description: Main entry point for the conversational AI assistant. Supports natural language requests and optional file uploads for Retrieval Augmented Generation (RAG). Handles both authenticated and guest users.
 *     tags:
 *       - Assistant
 *       - Plan Generation
 *     consumes:
 *       - multipart/form-data
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: Optional file for RAG context, such as a document or image.
 *       - in: body
 *         name: body
 *         description: Conversational request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ConversationalRequest'
 *     responses:
 *       200:
 *         description: Successful response with assistant's reply and generated plan data.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 reply:
 *                   type: string
 *                 plan:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions or daily limit exceeded.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit,
  uploadPlanFiles.single('file'),
  checkRAGFeature,
  // createRateLimiter(30, 15), // 30 requests per 15 minutes
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  asyncHandler(planGeneratorController.conversationalAssistant) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/assistant/async:
 *   post:
 *     summary: Asynchronous Conversational AI Assistant
 *     description: Initiates an asynchronous conversational AI task. Returns a task ID immediately. The status and result can be retrieved via `/api/v1/plan-generator/task/{taskId}`. Supports optional file uploads for RAG.
 *     tags:
 *       - Assistant
 *       - Plan Generation
 *       - Asynchronous
 *     consumes:
 *       - multipart/form-data
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         description: Optional file for RAG context, such as a document or image.
 *       - in: body
 *         name: body
 *         description: Conversational request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ConversationalRequest'
 *     responses:
 *       202:
 *         description: Accepted - Task initiated successfully. Returns a task ID.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                   description: The ID of the asynchronous task.
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions or daily limit exceeded.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/assistant/async',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  checkStorageLimit, // Added: Ensure storage limit is checked for file uploads in async requests, consistent with synchronous assistant.
  uploadPlanFiles.single('file'),
  // createRateLimiter(30, 15),
  validateRequest(PlanGeneratorValidation.conversationalRequestSchema),
  asyncHandler(planGeneratorController.conversationalAssistantAsync) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/task/{taskId}:
 *   get:
 *     summary: Get Asynchronous Task Status and Result
 *     description: Retrieves the current status and, if completed, the result of an asynchronous plan generation task.
 *     tags:
 *       - Asynchronous
 *       - Plan Generation
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: taskId
 *         description: The ID of the asynchronous task.
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Successful response with task status and result (if completed).
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [pending, in_progress, completed, failed]
 *                 result:
 *                   type: object
 *                   description: The result of the task, present if status is 'completed'.
 *       400:
 *         description: Bad Request - Invalid task ID format.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have permission to access this task.
 *       404:
 *         description: Not Found - Task with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.get(
  '/task/:taskId',
  optionalAuth(),
  asyncHandler(planGeneratorController.getTaskStatus) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/generate:
 *   post:
 *     summary: Direct Plan Generation
 *     description: Generates a plan directly based on provided parameters, bypassing the conversational interface. Ideal for programmatic integration.
 *     tags:
 *       - Plan Generation
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Plan generation parameters.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/GeneratePlanRequest'
 *     responses:
 *       200:
 *         description: Successful response with the generated plan data.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 plan:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions or daily limit exceeded.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  // createRateLimiter(20, 15), // 20 generations per 15 minutes
  validateRequest(PlanGeneratorValidation.generatePlanSchema),
  asyncHandler(planGeneratorController.generatePlan) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/brainstorm:
 *   post:
 *     summary: Brainstorm Ideas
 *     description: Generates brainstorming insights or ideas based on a prompt, without creating a full plan.
 *     tags:
 *       - Plan Generation
 *       - Brainstorming
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Brainstorming request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/BrainstormRequest'
 *     responses:
 *       200:
 *         description: Successful response with brainstorming insights.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 ideas:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/brainstorm',
  optionalAuth(),
  extractTenantContext, // Added: Ensure tenant context is extracted for resource management, consistent with other generation routes.
  checkDailyRequestLimit, // Added: Ensure daily request limits are applied for resource-consuming operations, consistent with other generation routes.
  // createRateLimiter(30, 15), // 30 brainstorms per 15 minutes
  validateRequest(PlanGeneratorValidation.brainstormSchema),
  asyncHandler(planGeneratorController.brainstormIdea) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/export:
 *   post:
 *     summary: Export Plan
 *     description: Exports a previously generated plan into various formats such as PDF, DOCX, JSON, or Markdown.
 *     tags:
 *       - Plan Generation
 *       - Export
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/pdf
 *       - application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *       - application/json
 *       - text/markdown
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Export plan request payload.
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ExportPlanRequest'
 *     responses:
 *       200:
 *         description: Successful response with the exported plan data/file.
 *         schema:
 *           type: string
 *           format: binary
 *         headers:
 *           Content-Disposition:
 *             type: string
 *             description: Attachment filename.
 *           Content-Type:
 *             type: string
 *             description: The content type of the exported file (e.g., application/pdf).
 *       400:
 *         description: Bad Request - Invalid input or missing required fields.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have necessary permissions.
 *       429:
 *         description: Too Many Requests - Rate limit exceeded.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.post(
  '/export',
  optionalAuth(),
  extractTenantContext, // Added: Ensure tenant context is extracted for resource management, consistent with other generation routes.
  checkDailyRequestLimit, // Added: Ensure daily request limits are applied for resource-consuming operations, consistent with other generation routes.
  // createRateLimiter(20, 15), // 20 exports per 15 minutes
  validateRequest(PlanGeneratorValidation.exportPlanSchema),
  asyncHandler(planGeneratorController.exportPlan) // Wrapped controller to catch async errors
);

/**
 * @swagger
 * /api/v1/plan-generator/conversation/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: Retrieves the full conversation history and associated plan data for a specific conversation ID. Requires user or admin authentication.
 *     tags:
 *       - Assistant
 *       - History
 *     security:
 *       - bearerAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         description: The ID of the conversation to retrieve.
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: Successful response with the conversation history and plan data.
 *         schema:
 *           type: object
 *           properties:
 *             success:
 *               type: boolean
 *             message:
 *               type: string
 *             data:
 *               type: object
 *               properties:
 *                 conversation:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                       content:
 *                         type: string
 *                 plan:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid conversation ID format.
 *       401:
 *         description: Unauthorized - Authentication required or invalid token.
 *       403:
 *         description: Forbidden - User does not have permission to access this conversation.
 *       404:
 *         description: Not Found - Conversation with the specified ID does not exist.
 *       500:
 *         description: Internal Server Error - Something went wrong on the server.
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  validateRequest(PlanGeneratorValidation.getConversationHistorySchema),
  asyncHandler(planGeneratorController.getConversationHistory) // Wrapped controller to catch async errors
);

/**
 * @typedef {object} ConversationalRequest
 * @property {string} message - The user's message or prompt.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {object} [context] - Optional additional context for the AI.
 * @property {string} [planId] - Optional ID of an existing plan to modify or reference.
 */

/**
 * @typedef {object} GeneratePlanRequest
 * @property {string} prompt - The main prompt for generating the plan.
 * @property {object} [parameters] - Optional specific parameters for plan generation (e.g., target audience, length).
 * @property {string} [planId] - Optional ID of an existing plan to modify or reference.
 */

/**
 * @typedef {object} BrainstormRequest
 * @property {string} prompt - The prompt for brainstorming ideas.
 * @property {object} [context] - Optional additional context for brainstorming.
 */

/**
 * @typedef {object} ExportPlanRequest
 * @property {string} planId - The ID of the plan to export.
 * @property {string} format - The desired export format (e.g., "pdf", "docx", "json", "md").
 * @property {object} [options] - Optional export-specific options (e.g., template, styling).
 */

/**
 * Express router for plan generation and assistant-related routes.
 * @type {express.Router}
 */
export const planGeneratorRoutes = router;