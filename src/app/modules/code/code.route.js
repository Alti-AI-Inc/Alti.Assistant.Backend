/**
 * @file This file defines the API routes for the Code Assistant module.
 * @module app/modules/code/code.route
 */

import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import { codeController } from './code.controller.js';
import { CodeValidation } from './code.validation.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

/**
 * Express router for code-related API endpoints.
 * @type {express.Router}
 */
const router = express.Router();

console.log('Code routes initialized');

/**
 * @swagger
 * /api/v1/code/assistant:
 *   post:
 *     summary: Perform a code-related task using the AI assistant.
 *     description: Sends a prompt to the AI code assistant to generate, refactor, or analyze code.
 *                  This endpoint is open to all users, with optional authentication to track usage
 *                  and apply user-specific limits. A rate limit of 30 requests per 15 minutes
 *                  applies per IP address. Daily request limits are also enforced.
 *     tags:
 *       - Code Assistant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The natural language prompt or code query for the AI assistant.
 *                 example: "Write a JavaScript function to reverse a string."
 *               language:
 *                 type: string
 *                 description: Optional. The programming language context for the prompt.
 *                 example: "javascript"
 *               context:
 *                 type: string
 *                 description: Optional. Additional context or existing code snippets to guide the AI.
 *                 example: "function sum(a, b) { return a + b; }"
 *     responses:
 *       200:
 *         description: Code task successfully processed.
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
 *                   example: "Code task completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     generatedCode:
 *                       type: string
 *                       description: The code generated or processed by the AI.
 *                       example: "function reverseString(str) { return str.split('').reverse().join(''); }"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security: [] # No required authentication, but optional authentication is supported via 'optionalAuth' middleware.
 */
router.post(
  '/assistant',
  optionalAuth(),
  extractTenantContext,
  checkDailyRequestLimit,
  createRateLimiter(30, 15), // 30 code requests per 15 minutes (applies to all users)
  validateRequest(CodeValidation.codeQuerySchema),
  codeController.performCodeTask
);

/**
 * @swagger
 * /api/v1/code/stats:
 *   get:
 *     summary: Get code generation statistics for the authenticated user or tenant.
 *     description: Retrieves usage statistics related to code generation tasks,
 *                  such as total requests, daily request counts, successful generations, etc.
 *                  Requires authentication with ADMIN or USER roles.
 *     tags:
 *       - Code Statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Code statistics retrieved successfully.
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
 *                   example: "Code statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: number
 *                       description: Total code generation requests made by the user/tenant.
 *                       example: 150
 *                     dailyRequests:
 *                       type: number
 *                       description: Code generation requests for the current day by the user/tenant.
 *                       example: 10
 *                     successfulGenerations:
 *                       type: number
 *                       description: Number of successfully completed code generations.
 *                       example: 145
 *                     failedGenerations:
 *                       type: number
 *                       description: Number of failed code generation attempts.
 *                       example: 5
 *                     lastRequestDate:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp of the last code generation request.
 *                       example: "2023-10-27T10:30:00Z"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/stats',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), // Keep regular auth for stats
  extractTenantContext,
  codeController.getCodeStats
);

/**
 * The main router for code-related API endpoints.
 * @type {express.Router}
 */
export const codeRoutes = router;