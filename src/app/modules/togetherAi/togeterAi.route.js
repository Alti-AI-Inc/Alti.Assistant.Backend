import express from 'express';
import { TogetherAiController } from './togeterAi.controller.js';
import { auth } from '../../middlewares/auth.js';

/**
 * Express router for Together AI integration.
 * Provides endpoints for image generation, global configuration management,
 * usage logging, and tenant-specific limit overrides.
 * 
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * @openapi
 * /api/v1/together-ai/create-img:
 *   post:
 *     summary: Generate image using Together AI
 *     description: Generates an image using Together AI models. Accessible by authenticated users (super_admin, tenant_admin, tenant_user). Subject to tenant-specific limits unless overridden by Platform Owner.
 *     tags:
 *       - Together AI
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
 *                 description: The text prompt to generate the image from.
 *                 example: "A futuristic city at sunset, digital art"
 *               model:
 *                 type: string
 *                 description: Together AI model to use.
 *                 example: "stabilityai/stable-diffusion-xl-base-1.0"
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
 *                       example: "https://together-ai-assets.s3.amazonaws.com/generated-image.png"
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
    TogetherAiController.TogetherAiImgGeneration
  );

/**
 * @openapi
 * /api/v1/together-ai/admin/config:
 *   get:
 *     summary: Get global Together AI configurations
 *     description: Retrieve global system-wide configurations for Together AI. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Together AI Admin
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
 *     summary: Update global Together AI configurations
 *     description: Update global system-wide configurations for Together AI. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Together AI Admin
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
 *                 example: "stabilityai/stable-diffusion-xl-base-1.0"
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
    TogetherAiController.getGlobalConfig
  )
  .patch(
    auth('super_admin'),
    TogetherAiController.updateGlobalConfig
  );

/**
 * @openapi
 * /api/v1/together-ai/admin/logs:
 *   get:
 *     summary: Get global Together AI logs
 *     description: Retrieve global Together AI generation logs and usage statistics. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Together AI Admin
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
    TogetherAiController.getGlobalLogs
  );

/**
 * @openapi
 * /api/v1/together-ai/admin/tenant-override:
 *   post:
 *     summary: Override tenant limits
 *     description: Override or bypass Together AI limits for a specific tenant. Restricted to Platform Owners (super_admin).
 *     tags:
 *       - Together AI Admin
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
    TogetherAiController.overrideTenantLimit
  );

/**
 * Exported Together AI Express routes.
 * @type {import('express').Router}
 */
export const togetherAiRoutes = router;