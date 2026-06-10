// This file has been refactored to use Google Cloud Vertex AI instead of Together AI.
// It is recommended to rename this file to 'vertexAi.route.js' and the corresponding controller.
import express from 'express';
import { VertexAiController } from './vertexAi.controller.js'; // Refactored to use VertexAiController
import { auth } from '../../middlewares/auth.js';

/**
 * A utility function to wrap asynchronous route handlers,
 * ensuring that any uncaught errors are passed to the Express error handling middleware.
 * @param {Function} fn The async route handler function.
 * @returns {Function} An Express route handler function.
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

/**
 * Express router for Vertex AI integration.
 * Provides endpoints for image generation, global configuration management,
 * usage logging, and tenant-specific limit overrides.
 * 
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * @openapi
 * /api/v1/vertex-ai/create-img:
 *   post:
 *     summary: Generate image using Vertex AI
 *     description: Generates an image using Vertex AI Imagen models. Accessible by authenticated users (super_admin, tenant_admin, tenant_user). Subject to tenant-specific limits unless overridden by Platform Owner. PII is automatically filtered from the prompt before sending to the model.
 *     tags:
 *       - Vertex AI
 *     security:
 *       - BearerAuth: []
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
 *                 description: The text prompt to generate the image from. PII will be masked.
 *                 example: "A futuristic city at sunset, digital art"
 *               model:
 *                 type: string
 *                 description: Vertex AI model to use. Defaults to the latest stable version.
 *                 example: "imagegeneration@006"
 *               width:
 *                 type: integer
 *                 description: Width of the generated image.
 *                 default: 1024
 *               height:
 *                 type: integer
 *                 description: Height of the generated image.
 *                 default: 1024
 *     responses:
 *       200:
 *         description: Image generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                       example: "https://storage.googleapis.com/your-bucket/generated-image.png"
 *       400:
 *         description: Invalid request payload or limit exceeded.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
router.route('/create-img')
  .post(
    auth('super_admin', 'tenant_admin', 'tenant_user'),
    catchAsync(VertexAiController.vertexAiImgGeneration) // Refactored to use VertexAiController
  );

/**
 * @openapi
 * /api/v1/vertex-ai/admin/config:
 *   get:
 *     summary: Get global Vertex AI configurations
 *     description: Retrieve global system-wide configurations for Vertex AI. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Vertex AI Admin
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Global configurations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Only super_admin allowed.
 *       500:
 *         description: Internal server error.
 *   patch:
 *     summary: Update global Vertex AI configurations
 *     description: Update global system-wide configurations for Vertex AI. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Vertex AI Admin
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
 *                 example: "imagegeneration@006"
 *               maxLimitPerTenant:
 *                 type: integer
 *                 example: 500
 *     responses:
 *       200:
 *         description: Global configurations updated successfully.
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
 *                   example: "Configuration updated successfully"
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Only super_admin allowed.
 *       500:
 *         description: Internal server error.
 */
router.route('/admin/config')
  .get(
    auth('super_admin'),
    catchAsync(VertexAiController.getGlobalConfig) // Refactored to use VertexAiController
  )
  .patch(
    auth('super_admin'),
    catchAsync(VertexAiController.updateGlobalConfig) // Refactored to use VertexAiController
  );

/**
 * @openapi
 * /api/v1/vertex-ai/admin/logs:
 *   get:
 *     summary: Get global Vertex AI logs
 *     description: Retrieve global Vertex AI generation logs and usage statistics. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Vertex AI Admin
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of logs per page.
 *     responses:
 *       200:
 *         description: Logs retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Only super_admin allowed.
 *       500:
 *         description: Internal server error.
 */
router.route('/admin/logs')
  .get(
    auth('super_admin'),
    catchAsync(VertexAiController.getGlobalLogs) // Refactored to use VertexAiController
  );

/**
 * @openapi
 * /api/v1/vertex-ai/admin/tenant-override:
 *   post:
 *     summary: Override tenant limits
 *     description: Override or bypass Vertex AI limits for a specific tenant. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Vertex AI Admin
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *               - limitOverride
 *             properties:
 *               tenantId:
 *                 type: string
 *                 description: The ID of the tenant to override limits for.
 *                 example: "tenant_12345"
 *               limitOverride:
 *                 type: integer
 *                 description: The new limit value or override configuration.
 *                 example: 1000
 *     responses:
 *       200:
 *         description: Tenant limit overridden successfully.
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
 *                   example: "Tenant limit override applied successfully"
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Only super_admin allowed.
 *       500:
 *         description: Internal server error.
 */
router.route('/admin/tenant-override')
  .post(
    auth('super_admin'),
    catchAsync(VertexAiController.overrideTenantLimit) // Refactored to use VertexAiController
  );

/**
 * Exported Vertex AI Express routes.
 * @type {import('express').Router}
 */
export const vertexAiRoutes = router; // Refactored to export vertexAiRoutes