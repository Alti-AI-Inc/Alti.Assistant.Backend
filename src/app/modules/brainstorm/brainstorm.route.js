import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { brainstormController } from './brainstorm.controller.js';
import { BrainstormValidation } from './brainstorm.validation.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

const router = express.Router();

/**
 * @swagger
 * /assistant:
 *   post:
 *     summary: Engage with the conversational AI assistant
 *     description: |
 *       Provides a natural language interface for brainstorming.
 *       Supports both authenticated users and guests.
 *       The assistant processes user prompts and generates creative ideas or responses.
 *       Includes daily request limits and rate limiting to ensure fair usage.
 *     tags:
 *       - Brainstorm
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConversationalBrainstormRequest'
 *           example:
 *             prompt: "I need ideas for a new marketing campaign for a sustainable coffee brand."
 *             conversationId: "optional-existing-conversation-id"
 *             model: "gpt-4o"
 *     responses:
 *       200:
 *         description: Successful response from the conversational assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Brainstorm response generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI-generated response.
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the current conversation.
 *                     isNewConversation:
 *                       type: boolean
 *                       description: Indicates if a new conversation was started.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  // Rate limiting should generally come before daily limits to quickly reject high-volume requests.
  createRateLimiter(30, 15),
  checkDailyRequestLimit,
  validateRequest(BrainstormValidation.conversationalBrainstormSchema),
  brainstormController.conversationalAssistant
);

/**
 * @swagger
 * /generate:
 *   post:
 *     summary: Generate a structured brainstorm session
 *     description: |
 *       Initiates a structured brainstorm session based on predefined parameters.
 *       This endpoint is suitable for programmatic generation of ideas, outlines, or content.
 *       Supports both authenticated users and guests.
 *     tags:
 *       - Brainstorm
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StructuredBrainstormRequest'
 *           example:
 *             topic: "Marketing strategies for a new SaaS product"
 *             format: "bullet_points"
 *             tone: "professional"
 *             audience: "B2B tech companies"
 *             numIdeas: 5
 *             model: "gpt-4o"
 *     responses:
 *       200:
 *         description: Structured brainstorm generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Structured brainstorm generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     brainstormId:
 *                       type: string
 *                       description: The ID of the newly generated brainstorm session.
 *                     content:
 *                       type: string
 *                       description: The generated brainstorm content.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/generate',
  optionalAuth(),
  extractTenantContext,
  // Added checkDailyRequestLimit for consistency with other generation endpoints.
  // Rate limiting should generally come before daily limits.
  createRateLimiter(20, 15),
  checkDailyRequestLimit,
  validateRequest(BrainstormValidation.structuredBrainstormSchema),
  brainstormController.generateBrainstorm
);

/**
 * @swagger
 * /conversation/{conversationId}:
 *   get:
 *     summary: Retrieve conversation history
 *     description: |
 *       Fetches the complete history of a specific conversational brainstorm session.
 *       Requires user authentication.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the conversation.
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         enum: [user, assistant]
 *                         description: The role of the speaker (user or assistant).
 *                       content:
 *                         type: string
 *                         description: The message content.
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: The timestamp of the message.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/conversation/:conversationId',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  // Added rate limiter to prevent abuse/scraping of conversation history.
  createRateLimiter(60, 15), // Example: 60 requests per 15 minutes for retrieval
  validateRequest(BrainstormValidation.getConversationHistorySchema),
  // IMPORTANT: The controller (brainstormController.getConversationHistory) MUST verify
  // that the requested conversationId belongs to the authenticated user (req.user.id)
  // or their tenant (req.tenant.id) to prevent Insecure Direct Object Reference (IDOR).
  brainstormController.getConversationHistory
);

/**
 * @swagger
 * /export:
 *   post:
 *     summary: Export a brainstorm session
 *     description: |
 *       Exports the content of a brainstorm session in a specified format.
 *       Requires user authentication.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExportBrainstormRequest'
 *           example:
 *             brainstormId: "some-brainstorm-id"
 *             format: "pdf"
 *             options:
 *               includeMetadata: true
 *     responses:
 *       200:
 *         description: Brainstorm session exported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Brainstorm exported successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     downloadUrl:
 *                       type: string
 *                       format: uri
 *                       description: URL to download the exported file.
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
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/export',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  // Added checkDailyRequestLimit for consistency with other generation/resource-intensive endpoints.
  // Rate limiting should generally come before daily limits.
  createRateLimiter(10, 15),
  checkDailyRequestLimit,
  validateRequest(BrainstormValidation.exportBrainstormSchema),
  // IMPORTANT: The controller (brainstormController.exportBrainstorm) MUST verify
  // that the requested brainstormId belongs to the authenticated user (req.user.id)
  // or their tenant (req.tenant.id) to prevent Insecure Direct Object Reference (IDOR).
  brainstormController.exportBrainstorm
);

/**
 * @swagger
 * /refine:
 *   post:
 *     summary: Refine an existing brainstorm session
 *     description: |
 *       Modifies or enhances an existing brainstorm session based on new instructions or parameters.
 *       Requires user authentication.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefineBrainstormRequest'
 *           example:
 *             brainstormId: "some-brainstorm-id"
 *             refinementPrompt: "Make the ideas more actionable and add a timeline."
 *             model: "gpt-4o"
 *     responses:
 *       200:
 *         description: Brainstorm session refined successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Brainstorm refined successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     brainstormId:
 *                       type: string
 *                       description: The ID of the refined brainstorm session.
 *                     updatedContent:
 *                       type: string
 *                       description: The updated brainstorm content.
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
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/refine',
  auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
  extractTenantContext,
  // Added checkDailyRequestLimit for consistency with other generation/modification endpoints.
  // Rate limiting should generally come before daily limits.
  createRateLimiter(20, 15),
  checkDailyRequestLimit,
  validateRequest(BrainstormValidation.refineBrainstormSchema),
  // IMPORTANT: The controller (brainstormController.refineBrainstorm) MUST verify
  // that the requested brainstormId belongs to the authenticated user (req.user.id)
  // or their tenant (req.tenant.id) to prevent Insecure Direct Object Reference (IDOR).
  brainstormController.refineBrainstorm
);

/**
 * @typedef {object} ConversationalBrainstormRequest
 * @property {string} prompt - The user's natural language prompt for the assistant.
 * @property {string} [conversationId] - Optional. The ID of an existing conversation to continue.
 * @property {string} [model] - Optional. The AI model to use for generation (e.g., 'gpt-4o').
 */

/**
 * @typedef {object} StructuredBrainstormRequest
 * @property {string} topic - The main topic for the brainstorm.
 * @property {string} [format] - Optional. Desired output format (e.g., 'bullet_points', 'paragraph', 'outline').
 * @property {string} [tone] - Optional. Desired tone of the output (e.g., 'professional', 'creative', 'casual').
 * @property {string} [audience] - Optional. Target audience for the brainstormed ideas.
 * @property {number} [numIdeas] - Optional. Number of ideas to generate.
 * @property {string} [model] - Optional. The AI model to use for generation (e.g., 'gpt-4o').
 */

/**
 * @typedef {object} GetConversationHistoryRequest
 * @property {string} conversationId - The ID of the conversation to retrieve history for.
 */

/**
 * @typedef {object} ExportBrainstormRequest
 * @property {string} brainstormId - The ID of the brainstorm session to export.
 * @property {string} format - The desired export format (e.g., 'pdf', 'docx', 'txt', 'json').
 * @property {object} [options] - Optional. Additional export options.
 * @property {boolean} [options.includeMetadata] - Optional. Whether to include metadata in the export.
 */

/**
 * @typedef {object} RefineBrainstormRequest
 * @property {string} brainstormId - The ID of the brainstorm session to refine.
 * @property {string} refinementPrompt - The prompt describing how to refine the brainstorm.
 * @property {string} [model] - Optional. The AI model to use for refinement (e.g., 'gpt-4o').
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ConversationalBrainstormRequest:
 *       type: object
 *       required:
 *         - prompt
 *       properties:
 *         prompt:
 *           type: string
 *           description: The user's natural language prompt for the assistant.
 *           example: "I need ideas for a new marketing campaign for a sustainable coffee brand."
 *         conversationId:
 *           type: string
 *           format: uuid
 *           description: Optional. The ID of an existing conversation to continue.
 *           example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *         model:
 *           type: string
 *           description: Optional. The AI model to use for generation (e.g., 'gpt-4o').
 *           example: "gpt-4o"
 *     StructuredBrainstormRequest:
 *       type: object
 *       required:
 *         - topic
 *       properties:
 *         topic:
 *           type: string
 *           description: The main topic for the brainstorm.
 *           example: "Marketing strategies for a new SaaS product"
 *         format:
 *           type: string
 *           description: Optional. Desired output format (e.g., 'bullet_points', 'paragraph', 'outline').
 *           enum: [bullet_points, paragraph, outline, json]
 *           example: "bullet_points"
 *         tone:
 *           type: string
 *           description: Optional. Desired tone of the output (e.g., 'professional', 'creative', 'casual').
 *           example: "professional"
 *         audience:
 *           type: string
 *           description: Optional. Target audience for the brainstormed ideas.
 *           example: "B2B tech companies"
 *         numIdeas:
 *           type: number
 *           format: integer
 *           description: Optional. Number of ideas to generate.
 *           minimum: 1
 *           maximum: 20
 *           example: 5
 *         model:
 *           type: string
 *           description: Optional. The AI model to use for generation (e.g., 'gpt-4o').
 *           example: "gpt-4o"
 *     ExportBrainstormRequest:
 *       type: object
 *       required:
 *         - brainstormId
 *         - format
 *       properties:
 *         brainstormId:
 *           type: string
 *           format: uuid
 *           description: The ID of the brainstorm session to export.
 *           example: "f1e2d3c4-b5a6-9876-5432-10fedcba9876"
 *         format:
 *           type: string
 *           description: The desired export format.
 *           enum: [pdf, docx, txt, json, markdown]
 *           example: "pdf"
 *         options:
 *           type: object
 *           description: Optional. Additional export options.
 *           properties:
 *             includeMetadata:
 *               type: boolean
 *               description: Whether to include metadata (e.g., creation date, author) in the export.
 *               example: true
 *     RefineBrainstormRequest:
 *       type: object
 *       required:
 *         - brainstormId
 *         - refinementPrompt
 *       properties:
 *         brainstormId:
 *           type: string
 *           format: uuid
 *           description: The ID of the brainstorm session to refine.
 *           example: "f1e2d3c4-b5a6-9876-5432-10fedcba9876"
 *         refinementPrompt:
 *           type: string
 *           description: The prompt describing how to refine the brainstorm.
 *           example: "Make the ideas more actionable and add a timeline."
 *         model:
 *           type: string
 *           description: Optional. The AI model to use for refinement (e.g., 'gpt-4o').
 *           example: "gpt-4o"
 *   responses:
 *     BadRequest:
 *       description: Bad Request - Invalid input data.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 400
 *               message:
 *                 type: string
 *                 example: "Validation Error"
 *               errorMessages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     path:
 *                       type: string
 *                     message:
 *                       type: string
 *     Unauthorized:
 *       description: Unauthorized - Authentication required or invalid token.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 401
 *               message:
 *                 type: string
 *                 example: "Unauthorized Access"
 *     Forbidden:
 *       description: Forbidden - User does not have necessary permissions.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 403
 *               message:
 *                 type: string
 *                 example: "Forbidden Access"
 *     NotFound:
 *       description: Not Found - The requested resource was not found.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 404
 *               message:
 *                 type: string
 *                 example: "Resource not found"
 *     TooManyRequests:
 *       description: Too Many Requests - Rate limit exceeded or daily request limit reached.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 429
 *               message:
 *                 type: string
 *                 example: "Too many requests, please try again later."
 *     InternalServerError:
 *       description: Internal Server Error - Something went wrong on the server.
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success:
 *                 type: boolean
 *                 example: false
 *               statusCode:
 *                 type: number
 *                 example: 500
 *               message:
 *                 type: string
 *                 example: "Internal Server Error"
 *
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *       description: Enter JWT Bearer token **_only_**
 */

/**
 * Express router for brainstorm-related routes.
 * @type {express.Router}
 */
export const brainstormRoutes = router;