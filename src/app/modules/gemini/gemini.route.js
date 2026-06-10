import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { GeminiAiController } from './gemini.controller.js';

// Enterprise Telemetry & Error Handling Patch:
// Added a utility function to wrap asynchronous route handlers. This ensures that any
// promise rejections are caught and passed to the Express error handling middleware,
// preventing the server from crashing on unhandled exceptions in async controllers.
// This allows a centralized error handler to log the error and normalize the response.
const catchAsync = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(err => next(err));
};

/**
 * @constant {express.Router} router - Express router for Gemini AI routes.
 */
const router = express.Router();

// =================================================================
// ==                      USER-FACING ROUTES                     ==
// =================================================================

/**
 * @swagger
 * /api/v1/gemini/get-response:
 *   post:
 *     summary: Get a response from the Gemini AI model.
 *     description: Sends a prompt to the Gemini AI model and retrieves its generated response.
 *                  Requires authentication with SUPER_ADMIN, ADMIN, MANAGER, or USER role.
 *     tags:
 *       - Gemini AI
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The user's prompt or message to send to the AI.
 *                 example: "Tell me a short story about a brave knight."
 *     responses:
 *       200:
 *         description: AI response successfully retrieved.
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
 *                   example: "AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "Once upon a time, in a land far away..."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/get-response',
  // GAP FIX: Added SUPER_ADMIN and MANAGER roles to ensure all roles in the hierarchy are properly validated and allowed access.
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER,
    ENUM_USER_ROLE.USER
  ),
  // Enterprise Telemetry & Error Handling Patch:
  // Wrapped the async controller with catchAsync to ensure proper error propagation.
  catchAsync(GeminiAiController.GeminiAiGetResponse)
);

/**
 * @swagger
 * /api/v1/gemini/flash/get-response:
 *   post:
 *     summary: Get a response from the Gemini 1.5 Flash AI model.
 *     description: Sends a prompt to the Gemini 1.5 Flash AI model (optimized for speed and cost)
 *                  and retrieves its generated response. Requires authentication with SUPER_ADMIN, ADMIN, MANAGER, or USER role.
 *     tags:
 *       - Gemini AI
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The user's prompt or message to send to the AI.
 *                 example: "Summarize the plot of Hamlet in 50 words."
 *     responses:
 *       200:
 *         description: AI response successfully retrieved from Gemini 1.5 Flash.
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
 *                   example: "Flash AI response retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "Prince Hamlet seeks revenge for his father's murder by his uncle Claudius, who married Hamlet's mother. His indecision, madness, and a play within a play lead to a tragic end for most characters, including Hamlet himself."
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/flash/get-response',
  // GAP FIX: Added SUPER_ADMIN and MANAGER roles to ensure all roles in the hierarchy are properly validated and allowed access.
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER,
    ENUM_USER_ROLE.USER
  ),
  // BUG FIX: Renamed controller method to align with the route's purpose (Gemini 1.5 Flash).
  // The previous name 'Gemini25PreviewAiGetResponse' was misleading given the route path and description,
  // suggesting a different model version than intended for the '/flash' endpoint.
  // Enterprise Telemetry & Error Handling Patch: Wrapped the async controller with catchAsync to ensure proper error propagation.
  catchAsync(GeminiAiController.GeminiFlashAiGetResponse)
);

// =================================================================
// ==           PLATFORM OWNER / SUPER ADMIN ROUTES               ==
// =================================================================
// PLATFORM OWNER ENHANCEMENT: Added a dedicated section for Super Admin routes
// to provide global oversight, configuration, and management of the Gemini AI service
// across all tenants. These endpoints are strictly protected and accessible only
// by users with the SUPER_ADMIN role.

/**
 * @swagger
 * /api/v1/gemini/admin/stats:
 *   get:
 *     summary: Get global Gemini AI usage statistics.
 *     description: Retrieves platform-wide usage statistics, such as total requests, token counts, and usage by tenant.
 *                  Requires SUPER_ADMIN role.
 *     tags:
 *       - Gemini AI (Admin)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Global statistics retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/admin/stats',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  catchAsync(GeminiAiController.getGlobalStats)
);

/**
 * @swagger
 * /api/v1/gemini/admin/logs:
 *   get:
 *     summary: Get global Gemini AI interaction logs.
 *     description: Retrieves a paginated list of all AI interactions across the platform. Supports filtering by tenant, user, and date range.
 *                  Requires SUPER_ADMIN role.
 *     tags:
 *       - Gemini AI (Admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of logs per page.
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filter logs by a specific tenant ID.
 *     responses:
 *       200:
 *         description: Global logs retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/admin/logs',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  catchAsync(GeminiAiController.getGlobalLogs)
);

/**
 * @swagger
 * /api/v1/gemini/admin/config:
 *   get:
 *     summary: Get platform-wide Gemini AI configuration.
 *     description: Retrieves the current system-wide configuration for the Gemini AI service, such as enabled models, global rate limits, and feature flags.
 *                  Requires SUPER_ADMIN role.
 *     tags:
 *       - Gemini AI (Admin)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *   put:
 *     summary: Update platform-wide Gemini AI configuration.
 *     description: Updates the system-wide configuration for the Gemini AI service. Allows the Platform Owner to change default models, adjust global limits, etc.
 *                  Requires SUPER_ADMIN role.
 *     tags:
 *       - Gemini AI (Admin)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultModel:
 *                 type: string
 *                 example: "gemini-1.5-pro-latest"
 *               globalRequestLimit:
 *                 type: number
 *                 example: 10000
 *     responses:
 *       200:
 *         description: Configuration updated successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/admin/config',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  catchAsync(GeminiAiController.getPlatformConfig)
);
router.put(
  '/admin/config',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  catchAsync(GeminiAiController.updatePlatformConfig)
);

/**
 * @swagger
 * /api/v1/gemini/admin/tenants/{tenantId}/suspend:
 *   put:
 *     summary: Suspend a tenant's access to Gemini AI.
 *     description: Disables the Gemini AI service for a specific tenant.
 *                  Requires SUPER_ADMIN role.
 *     tags:
 *       - Gemini AI (Admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to suspend.
 *     responses:
 *       200:
 *         description: Tenant suspended successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Tenant not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put(
  '/admin/tenants/:tenantId/suspend',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  catchAsync(GeminiAiController.suspendTenantAccess)
);

/**
 * @swagger
 * /api/v1/gemini/admin/tenants/{tenantId}/unsuspend:
 *   put:
 *     summary: Unsuspend a tenant's access to Gemini AI.
 *     description: Re-enables the Gemini AI service for a previously suspended tenant.
 *                  Requires SUPER_ADMIN role.
 *     tags:
 *       - Gemini AI (Admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the tenant to unsuspend.
 *     responses:
 *       200:
 *         description: Tenant unsuspended successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: Tenant not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put(
  '/admin/tenants/:tenantId/unsuspend',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  catchAsync(GeminiAiController.unsuspendTenantAccess)
);

/**
 * @exports {express.Router} geminiAiRoutes - The router for Gemini AI related API endpoints.
 */
export const geminiAiRoutes = router;