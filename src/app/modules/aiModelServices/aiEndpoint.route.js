import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { AiEndpointsController } from './aiEndpoint.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/ai-models/all-model:
 *   get:
 *     summary: Get all AI models for the current application
 *     description: Retrieves a list of all AI model endpoints configured for the application associated with the current tenant context. Requires SUPER_ADMIN or ADMIN role.
 *     tags:
 *       - AI Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Tenant-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tenant (application) context.
 *     responses:
 *       200:
 *         description: An array of AI model endpoint objects.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   endpointUrl:
 *                     type: string
 *                   description:
 *                     type: string
 *                   modelType:
 *                     type: string
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       403:
 *         description: Forbidden. User does not have the required role.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/all-model',
  extractTenantContext,
  // BUG FIX: Role validation updated to include SUPER_ADMIN, ensuring proper role hierarchy.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.getAiEndpointForApp
);

/**
 * @swagger
 * /api/ai-models/all-model-web:
 *   get:
 *     summary: Get all web-specific AI models for the current application
 *     description: Retrieves a list of AI model endpoints specifically configured for web usage within the current tenant context. Requires SUPER_ADMIN or ADMIN role.
 *     tags:
 *       - AI Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Tenant-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tenant (application) context.
 *     responses:
 *       200:
 *         description: An array of web AI model endpoint objects.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   endpointUrl:
 *                     type: string
 *                   description:
 *                     type: string
 *                   modelType:
 *                     type: string
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       403:
 *         description: Forbidden. User does not have the required role.
 *       500:
 *         description: Internal server error.
 */
router.get(
  '/all-model-web',
  extractTenantContext,
  // BUG FIX: Role validation updated to include SUPER_ADMIN, ensuring proper role hierarchy.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.getWebAiEndpoint
);

/**
 * @swagger
 * /api/ai-models/add-model:
 *   post:
 *     summary: Add a new AI model endpoint
 *     description: Creates and adds a new AI model endpoint configuration for the current application. Requires SUPER_ADMIN or ADMIN role.
 *     tags:
 *       - AI Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Tenant-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tenant (application) context.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - endpointUrl
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the AI model.
 *                 example: "OpenAI GPT-4"
 *               endpointUrl:
 *                 type: string
 *                 description: The URL of the AI model endpoint.
 *                 example: "https://api.openai.com/v1/chat/completions"
 *               description:
 *                 type: string
 *                 description: A description for the AI model.
 *                 example: "Generative AI model by OpenAI"
 *               modelType:
 *                 type: string
 *                 description: The type of AI model (e.g., 'LLM', 'Embedding').
 *                 example: "LLM"
 *     responses:
 *       201:
 *         description: The newly created AI model endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 endpointUrl:
 *                   type: string
 *                 description:
 *                   type: string
 *                 modelType:
 *                   type: string
 *       400:
 *         description: Bad request if required fields are missing or invalid.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       403:
 *         description: Forbidden. User does not have the required role.
 *       500:
 *         description: Internal server error.
 */
router.post(
  '/add-model',
  extractTenantContext,
  // BUG FIX: Role validation updated to include SUPER_ADMIN, ensuring proper role hierarchy.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.addAiEndpoint
);

/**
 * @swagger
 * /api/ai-models/update-model:
 *   patch:
 *     summary: Update an existing web-specific AI model endpoint
 *     description: Modifies the details of an existing AI model endpoint specifically configured for web usage within the current tenant context. Requires SUPER_ADMIN or ADMIN role.
 *     tags:
 *       - AI Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Tenant-Id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the tenant (application) context.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: The ID of the AI model endpoint to update.
 *                 example: "654321098765432109876543"
 *               name:
 *                 type: string
 *                 description: The updated name of the AI model.
 *                 example: "Updated OpenAI GPT-4"
 *               endpointUrl:
 *                 type: string
 *                 description: The updated URL of the AI model endpoint.
 *                 example: "https://api.openai.com/v1/chat/completions-new"
 *               description:
 *                 type: string
 *                 description: An updated description for the AI model.
 *                 example: "Updated generative AI model by OpenAI"
 *               modelType:
 *                 type: string
 *                 description: The updated type of AI model.
 *                 example: "LLM_Advanced"
 *     responses:
 *       200:
 *         description: The updated AI model endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 endpointUrl:
 *                   type: string
 *                 description:
 *                   type: string
 *                 modelType:
 *                   type: string
 *       400:
 *         description: Bad request if required fields are missing or invalid.
 *       401:
 *         description: Unauthorized. User is not authenticated.
 *       403:
 *         description: Forbidden. User does not have the required role.
 *       404:
 *         description: Not Found if the AI model endpoint does not exist.
 *       500:
 *         description: Internal server error.
 */
router.patch(
  '/update-model',
  extractTenantContext,
  // BUG FIX: Role validation updated to include SUPER_ADMIN, ensuring proper role hierarchy.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN),
  AiEndpointsController.updateWebAiEndpoint
);

/**
 * @typedef {import('express').Router} Router
 */

/**
 * Express router for managing AI model endpoints.
 * Provides routes for retrieving, adding, and updating AI model configurations
 * within a tenant-specific context. All routes require SUPER_ADMIN or ADMIN privileges.
 * @type {Router}
 * @namespace aiModelEndpointRoutes
 */
export const aiModelEndpointRoutes = router;