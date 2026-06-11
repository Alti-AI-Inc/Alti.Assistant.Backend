/**
 * @file Controller for managing AI endpoint configurations.
 * @module app/modules/aiModelServices/aiEndpoint.controller
 * @description This controller provides platform-owner/super-admin functionalities for global oversight and
 * system-wide configuration of AI model service endpoints. It allows for adding, viewing, updating, and deleting
 * AI service configurations, which are available to all tenants on the platform. Access to administrative
 * endpoints (POST, PATCH, DELETE) must be restricted to users with 'platform-owner' or 'super-admin' roles.
 * @author Your Name <your.email@example.com>
 */

import httpStatus from 'http-status';
import AiEndpoint from './aiEndpoint.Model.js';
// DEPRECATION: The static aiEndpoint.utils.js is no longer used for fetching endpoints to ensure consistency.
// All endpoints are now fetched dynamically from the database.
// import aiEndpoints from './aiEndpoint.utils.js';
import auditLogger from '../../../shared/auditLogger.js';
import logger from '../../../shared/logger.js';
import ApiError from '../../../core/ApiError.js';

// Optimization Recommendations:
// For improved query performance, ensure the following indexes are defined in the `AiEndpoint` Mongoose schema (aiEndpoint.Model.js):
//
// 1. Unique index on `title` for fast lookups and uniqueness enforcement:
//    aiEndpointSchema.index({ title: 1 }, { unique: true });
//
// 2. Index on `createdAt` for efficient sorting in `getAllAiEndpoints`:
//    aiEndpointSchema.index({ createdAt: -1 });
//
// 3. Partial index on `default` for fast updates when changing the default endpoint.
//    This is highly efficient as it only indexes documents where `default` is true.
//    aiEndpointSchema.index({ default: 1 }, { partialFilterExpression: { default: true } });

/**
 * @swagger
 * tags:
 *   name: AI Endpoints (Platform Owner)
 *   description: API for global management of AI model service endpoints. Requires Platform Owner role for CUD operations.
 */

/**
 * Adds a new AI endpoint configuration to the database.
 * Platform Owner role required.
 *
 * @function addAiEndpoint
 * @param {object} req - The Express request object.
 * @param {object} req.user - The authenticated user object (from auth middleware).
 * @param {string} req.user.id - The ID of the user performing the action.
 * @param {string} req.user.role - The role of the user performing the action.
 * @param {object} req.body - The request body containing AI endpoint details.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints:
 *   post:
 *     summary: (Admin) Add a new AI endpoint
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Creates a new AI endpoint configuration for the entire platform. Requires Platform Owner role.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AiEndpointInput'
 *     responses:
 *       201:
 *         description: AI endpoint created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseSuccess'
 *       400:
 *         description: Bad request due to missing fields or existing endpoint.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User does not have Platform Owner role.
 *       500:
 *         description: Internal server error.
 */
const addAiEndpoint = async (req, res) => {
  try {
    // IMPROVEMENT: Centralized role check for Platform Owner/Super Admin.
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: You do not have the required permissions to perform this action.');
    }

    const {
      title,
      nickName,
      enabled,
      default: isDefault,
      add,
      history,
      delete: deleteUrl,
    } = req.body;

    // Validate required fields
    if (!title || !nickName || !add || !history || !deleteUrl) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'All fields (title, nickName, add, history, delete) are required.');
    }

    // Check if the title already exists
    const existingEndpoint = await AiEndpoint.findOne({ title }).lean();
    if (existingEndpoint) {
      throw new ApiError(httpStatus.BAD_REQUEST, `AI endpoint with title '${title}' already exists.`);
    }

    // If setting this as the new default, unset the current default in a single transaction-like operation.
    if (isDefault === true) {
      await AiEndpoint.updateMany({ default: true }, { $set: { default: false } });
    }

    const newEndpoint = await AiEndpoint.create({
      title,
      nickName,
      enabled: enabled || false,
      default: isDefault || false,
      add,
      history,
      delete: deleteUrl,
    });

    auditLogger.info({
      severity: 'INFO',
      message: `User ${req.user.id} successfully created AI endpoint ${newEndpoint._id}.`,
      actor: req.user.id,
      action: 'create_ai_endpoint',
      resource: newEndpoint._id,
      details: { title: newEndpoint.title, enabled: newEndpoint.enabled, default: newEndpoint.default },
      status: 'success',
    });

    res.status(httpStatus.CREATED).json({
      statusCode: httpStatus.CREATED,
      status: 'Success',
      message: `AI endpoint '${title}' created successfully.`,
      data: newEndpoint,
    });
  } catch (error) {
    logger.error('Failed to add AI endpoint in addAiEndpoint controller:', error);
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to create AI endpoint. Error: ${error.message || 'Unknown error'}`,
      actor: req.user?.id,
      action: 'create_ai_endpoint',
      details: req.body,
      status: 'failure',
      error: { message: error.message, stack: error.stack, name: error.name },
    });

    const apiError = error instanceof ApiError ? error : new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * Retrieves all AI endpoint configurations from the database.
 * Provides global oversight for platform owners and can be used by clients to fetch available services.
 *
 * @function getAllAiEndpoints
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints:
 *   get:
 *     summary: Get all AI endpoints (Admin/Public)
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Fetches all AI endpoint configurations. Provides a global view of all available AI services.
 *     responses:
 *       200:
 *         description: Successfully fetched AI endpoints.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "Fetched AI endpoints successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AiEndpoint'
 *       500:
 *         description: Internal server error.
 */
const getAllAiEndpoints = async (req, res) => {
  try {
    const endpoints = await AiEndpoint.find().sort({ createdAt: -1 }).lean();
    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoints successfully',
      data: endpoints,
    });
  } catch (error) {
    logger.error('Failed to fetch all AI endpoints in getAllAiEndpoints controller:', error);
    const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred while fetching AI endpoints.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * Retrieves a single AI endpoint by its ID.
 *
 * @function getAiEndpointById
 * @param {object} req - The Express request object.
 * @param {string} req.params.id - The ID of the endpoint to retrieve.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/{id}:
 *   get:
 *     summary: Get a single AI endpoint by ID
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Fetches a specific AI endpoint configuration by its unique ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the AI endpoint.
 *     responses:
 *       200:
 *         description: Successfully fetched AI endpoint.
 *       404:
 *         description: AI endpoint not found.
 *       500:
 *         description: Internal server error.
 */
const getAiEndpointById = async (req, res) => {
  try {
    const { id } = req.params;
    const endpoint = await AiEndpoint.findById(id).lean();

    if (!endpoint) {
      throw new ApiError(httpStatus.NOT_FOUND, `AI endpoint with ID '${id}' not found.`);
    }

    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoint successfully',
      data: endpoint,
    });
  } catch (error) {
    logger.error(`Failed to fetch AI endpoint by ID ${req.params.id} in getAiEndpointById controller:`, error);
    const apiError = error instanceof ApiError ? error : new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * Updates an existing AI endpoint configuration.
 * Platform Owner role required.
 *
 * @function updateAiEndpoint
 * @param {object} req - The Express request object.
 * @param {string} req.params.id - The ID of the endpoint to update.
 * @param {object} req.body - The request body containing update details.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/{id}:
 *   patch:
 *     summary: (Admin) Update an AI endpoint by ID
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Updates any field of an existing AI endpoint. If `default` is set to true, all other endpoints will be set to non-default. Requires Platform Owner role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the AI endpoint to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AiEndpointUpdateInput'
 *     responses:
 *       200:
 *         description: AI endpoint updated successfully.
 *       400:
 *         description: Bad request (e.g., duplicate title).
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: AI endpoint not found.
 *       500:
 *         description: Internal server error.
 */
const updateAiEndpoint = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: You do not have the required permissions to perform this action.');
    }

    if (updateData.title) {
      const existingEndpoint = await AiEndpoint.findOne({ title: updateData.title, _id: { $ne: id } }).lean();
      if (existingEndpoint) {
        throw new ApiError(httpStatus.BAD_REQUEST, `An AI endpoint with title '${updateData.title}' already exists.`);
      }
    }

    if (updateData.default === true) {
      await AiEndpoint.updateMany({ _id: { $ne: id }, default: true }, { $set: { default: false } });
    }

    const updatedEndpoint = await AiEndpoint.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true }).lean();

    if (!updatedEndpoint) {
      throw new ApiError(httpStatus.NOT_FOUND, `AI endpoint with ID '${id}' not found.`);
    }

    auditLogger.info({
      severity: 'INFO',
      message: `User ${req.user.id} successfully updated AI endpoint ${updatedEndpoint._id}.`,
      actor: req.user.id,
      action: 'update_ai_endpoint',
      resource: updatedEndpoint._id,
      details: { changes: updateData },
      status: 'success',
    });

    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `Updated AI endpoint '${updatedEndpoint.title}' successfully.`,
      data: updatedEndpoint,
    });
  } catch (error) {
    logger.error(`Failed to update AI endpoint ${id} in updateAiEndpoint controller:`, error);
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to update AI endpoint ${id}. Error: ${error.message || 'Unknown error'}`,
      actor: req.user?.id,
      action: 'update_ai_endpoint',
      resource: id,
      details: { changes: updateData },
      status: 'failure',
      error: { message: error.message, stack: error.stack, name: error.name },
    });

    const apiError = error instanceof ApiError ? error : new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * Deletes an AI endpoint configuration.
 * Platform Owner role required.
 *
 * @function deleteAiEndpoint
 * @param {object} req - The Express request object.
 * @param {string} req.params.id - The ID of the endpoint to delete.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/{id}:
 *   delete:
 *     summary: (Admin) Delete an AI endpoint
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Permanently deletes an AI endpoint configuration. The default endpoint cannot be deleted. Requires Platform Owner role.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the AI endpoint to delete.
 *     responses:
 *       200:
 *         description: AI endpoint deleted successfully.
 *       400:
 *         description: Bad request (e.g., trying to delete the default endpoint).
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: AI endpoint not found.
 *       500:
 *         description: Internal server error.
 */
const deleteAiEndpoint = async (req, res) => {
  const { id } = req.params;
  try {
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: You do not have the required permissions to perform this action.');
    }

    const endpointToDelete = await AiEndpoint.findById(id).lean();
    if (!endpointToDelete) {
      throw new ApiError(httpStatus.NOT_FOUND, `AI endpoint with ID '${id}' not found.`);
    }

    if (endpointToDelete.default) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete the default AI endpoint. Please set a different endpoint as default before deleting this one.');
    }

    await AiEndpoint.findByIdAndDelete(id);

    auditLogger.info({
      severity: 'INFO',
      message: `User ${req.user.id} successfully deleted AI endpoint ${id}.`,
      actor: req.user.id,
      action: 'delete_ai_endpoint',
      resource: id,
      details: { title: endpointToDelete.title },
      status: 'success',
    });

    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `AI endpoint '${endpointToDelete.title}' deleted successfully.`,
      data: null,
    });
  } catch (error) {
    logger.error(`Failed to delete AI endpoint ${id} in deleteAiEndpoint controller:`, error);
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to delete AI endpoint ${id}. Error: ${error.message || 'Unknown error'}`,
      actor: req.user?.id,
      action: 'delete_ai_endpoint',
      resource: id,
      status: 'failure',
      error: { message: error.message, stack: error.stack, name: error.name },
    });

    const apiError = error instanceof ApiError ? error : new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * NEW: Retrieves global statistics about AI endpoints.
 * Provides high-level oversight for Platform Owners.
 *
 * @function getAiEndpointStats
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/stats:
 *   get:
 *     summary: (Admin) Get AI endpoint statistics
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Retrieves aggregate statistics about the AI endpoints, such as total count, enabled count, and the current default. Requires Platform Owner role.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "Fetched AI endpoint statistics successfully." }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalEndpoints: { type: number }
 *                     enabledCount: { type: number }
 *                     disabledCount: { type: number }
 *                     defaultEndpoint:
 *                       type: object
 *                       properties:
 *                         _id: { type: string }
 *                         title: { type: string }
 *                         nickName: { type: string }
 *       403:
 *         description: Forbidden.
 *       500:
 *         description: Internal server error.
 */
const getAiEndpointStats = async (req, res) => {
  try {
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: You do not have the required permissions to perform this action.');
    }

    const totalEndpoints = await AiEndpoint.countDocuments();
    const enabledCount = await AiEndpoint.countDocuments({ enabled: true });
    const defaultEndpoint = await AiEndpoint.findOne({ default: true }).select('title nickName').lean();

    const stats = {
      totalEndpoints,
      enabledCount,
      disabledCount: totalEndpoints - enabledCount,
      defaultEndpoint: defaultEndpoint || null,
    };

    auditLogger.info({
      severity: 'INFO',
      message: `User ${req.user.id} accessed AI endpoint statistics.`,
      actor: req.user.id,
      action: 'get_ai_endpoint_stats',
      status: 'success',
    });

    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoint statistics successfully.',
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to fetch AI endpoint stats in getAiEndpointStats controller:', error);
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to fetch AI endpoint stats. Error: ${error.message || 'Unknown error'}`,
      actor: req.user?.id,
      action: 'get_ai_endpoint_stats',
      status: 'failure',
      error: { message: error.message, stack: error.stack, name: error.name },
    });

    const apiError = error instanceof ApiError ? error : new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * @swagger
 * components:
 *   schemas:
 *     AiEndpoint:
 *       type: object
 *       properties:
 *         _id: { type: string, description: "The auto-generated unique identifier.", example: "65e6d6b2a7b8c9d0e1f2a3b4" }
 *         title: { type: string, description: "The unique title of the AI endpoint.", example: "Groq Llama3 Endpoint" }
 *         nickName: { type: string, description: "A user-friendly nickname.", example: "Groq Llama3" }
 *         enabled: { type: boolean, description: "Whether the endpoint is globally enabled.", default: false }
 *         default: { type: boolean, description: "Whether this is the platform default endpoint.", default: false }
 *         add: { type: string, description: "The URL/path for adding interactions.", example: "/groq/add-interaction" }
 *         history: { type: string, description: "The URL/path for retrieving history.", example: "/groq/get-history" }
 *         delete: { type: string, description: "The URL/path for deleting interactions.", example: "/groq/delete-interaction" }
 *         createdAt: { type: string, format: "date-time" }
 *         updatedAt: { type: string, format: "date-time" }
 *     AiEndpointInput:
 *       type: object
 *       required: [ "title", "nickName", "add", "history", "delete" ]
 *       properties:
 *         title: { type: string, example: "New OpenAI GPT-4o Endpoint" }
 *         nickName: { type: string, example: "GPT-4o" }
 *         enabled: { type: boolean, default: true }
 *         default: { type: boolean, default: false }
 *         add: { type: string, example: "/openai/add-interaction" }
 *         history: { type: string, example: "/openai/get-history" }
 *         delete: { type: string, example: "/openai/delete-interaction" }
 *     AiEndpointUpdateInput:
 *       type: object
 *       properties:
 *         title: { type: string, example: "Updated Groq Llama3 Endpoint" }
 *         nickName: { type: string, example: "Groq Llama3 (Fast)" }
 *         enabled: { type: boolean, example: false }
 *         default: { type: boolean, example: true }
 *     ApiResponseSuccess:
 *       type: object
 *       properties:
 *         statusCode: { type: number }
 *         status: { type: string, example: "Success" }
 *         message: { type: string }
 *         data:
 *           $ref: '#/components/schemas/AiEndpoint'
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// --- Client-Facing Endpoints ---

/**
 * Retrieves all enabled AI endpoints for web clients.
 * @function getWebAiEndpoint
 */
const getWebAiEndpoint = async (req, res) => {
  try {
    // IMPROVEMENT: Fetch only enabled endpoints and select fields relevant to the client.
    const endpoints = await AiEndpoint.find({ enabled: true }).select('title nickName add history delete default').lean();
    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoints successfully',
      anonymously: '/groq/get-response-anonymously', // Note: This could be a global platform setting.
      data: endpoints,
    });
  } catch (error) {
    logger.error('Failed to fetch web AI endpoints in getWebAiEndpoint controller:', error);
    const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred while fetching AI endpoints.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * Retrieves all enabled AI endpoints for mobile/desktop apps.
 * @function getAiEndpointForApp
 */
const getAiEndpointForApp = async (req, res) => {
  try {
    // FIX: Fetches from the database to ensure consistency, not from a static file.
    const endpoints = await AiEndpoint.find({ enabled: true }).select('title nickName add history delete default').lean();
    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoints successfully',
      anonymously: '/groq/get-response-anonymously',
      data: endpoints,
    });
  } catch (error) {
    logger.error('Failed to fetch AI endpoints for app in getAiEndpointForApp controller:', error);
    const apiError = new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An internal server error occurred while fetching AI endpoints.');
    res.status(apiError.statusCode).json({ status: 'fail', message: apiError.message });
  }
};

/**
 * @namespace AiEndpointsController
 * @description Controller methods for Platform Owner management of AI endpoints.
 */
export const AiEndpointsController = {
  // --- Platform Owner/Admin CUD Endpoints ---
  addAiEndpoint,
  updateAiEndpoint,
  deleteAiEndpoint,

  // --- Platform Owner/Admin Oversight Endpoints ---
  getAllAiEndpoints, // Full list for admins
  getAiEndpointById,
  getAiEndpointStats, // Global statistics

  // --- Public/Client-Facing Read Endpoints ---
  getWebAiEndpoint,
  getAiEndpointForApp,
};