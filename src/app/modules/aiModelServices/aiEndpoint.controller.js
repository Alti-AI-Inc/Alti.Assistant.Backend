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
import aiEndpoints from './aiEndpoint.utils.js';
// Hypothetical audit logger for Platform Owner actions. Assumes a logger is configured elsewhere.
import auditLogger from '../../../shared/auditLogger.js';
// PATCH: Import general system logger for detailed error logging.
import logger from '../../../shared/logger.js';
// PATCH: Import ApiError for standardized, user-friendly error responses.
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
 * @param {string} req.body.title - The unique title of the AI endpoint.
 * @param {string} req.body.nickName - A user-friendly nickname for the AI endpoint.
 * @param {boolean} [req.body.enabled=false] - Indicates if the endpoint is enabled globally.
 * @param {boolean} [req.body.default=false] - Indicates if this is the default AI endpoint for the platform.
 * @param {string} req.body.add - The URL or path for adding new AI interactions.
 * @param {string} req.body.history - The URL or path for retrieving AI interaction history.
 * @param {string} req.body.delete - The URL or path for deleting AI interactions.
 * @param {object} res - The Express response object.
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseFail'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User does not have Platform Owner role.
 *       500:
 *         description: Internal server error.
 */
const addAiEndpoint = async (req, res) => {
  try {
    // SECURITY FIX: Enforce role-based access control. Only super_admin or platform_owner can add endpoints.
    // This prevents any authenticated user from modifying global platform settings.
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      return res.status(httpStatus.FORBIDDEN).json({
        status: 'fail',
        message: 'Forbidden: You do not have the required permissions to perform this action.',
      });
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
      return res.status(httpStatus.BAD_REQUEST).json({
        status: 'fail',
        message: 'All fields (title, nickName, add, history, delete) are required.',
      });
    }

    // Check if the title already exists
    const existingEndpoint = await AiEndpoint.findOne({ title }).lean();
    if (existingEndpoint) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: 'fail',
        message: `AI endpoint with title '${title}' already exists.`,
      });
    }

    // If setting this as the new default, unset the current default
    if (isDefault === true) {
      await AiEndpoint.updateMany({ default: true }, { $set: { default: false } });
    }

    // Create and save the new endpoint
    const newEndpoint = await AiEndpoint.create({
      title,
      nickName,
      enabled: enabled || false,
      default: isDefault || false,
      add,
      history,
      delete: deleteUrl,
    });

    // GCP COMPLIANCE: Added 'severity' and 'message' keys for structured logging.
    auditLogger.info({
      severity: 'INFO',
      message: `User ${req.user.id} successfully created AI endpoint ${newEndpoint._id}.`,
      actor: req.user.id, // Assumes auth middleware provides req.user
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
    // PATCH: Add detailed system-level error logging.
    logger.error('Failed to add AI endpoint in addAiEndpoint controller:', error);

    // GCP COMPLIANCE: Added 'severity' and 'message' keys, and structured error details for structured logging.
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to create AI endpoint. Error: ${error.message}`,
      actor: req.user?.id,
      action: 'create_ai_endpoint',
      details: req.body,
      status: 'failure',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });

    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while creating the AI endpoint.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
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
 *     summary: Get all AI endpoints
 *     tags: [AI Endpoints (Platform Owner)]
 *     description: Fetches all AI endpoint configurations stored in the database. This provides a global view of all available AI services on the platform.
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
    // Optimization: Use .lean() for read-only queries to get plain JavaScript objects.
    const endpoints = await AiEndpoint.find().sort({ createdAt: -1 }).lean();
    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoints successfully',
      data: endpoints,
    });
  } catch (error) {
    // PATCH: Add detailed system-level error logging.
    logger.error('Failed to fetch all AI endpoints in getAllAiEndpoints controller:', error);

    // GCP COMPLIANCE: Added structured error logging.
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to fetch all AI endpoints. Error: ${error.message}`,
      action: 'get_all_ai_endpoints',
      status: 'failure',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });

    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while fetching AI endpoints.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseSuccess'
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
      return res.status(httpStatus.NOT_FOUND).json({
        status: 'fail',
        message: `AI endpoint with ID '${id}' not found.`,
      });
    }

    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI endpoint successfully',
      data: endpoint,
    });
  } catch (error) {
    // PATCH: Add detailed system-level error logging.
    logger.error(`Failed to fetch AI endpoint by ID ${req.params.id} in getAiEndpointById controller:`, error);

    // GCP COMPLIANCE: Added structured error logging.
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to fetch AI endpoint by ID ${req.params.id}. Error: ${error.message}`,
      action: 'get_ai_endpoint_by_id',
      resource: req.params.id,
      status: 'failure',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });

    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while fetching the AI endpoint.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
  }
};

/**
 * Updates an existing AI endpoint configuration.
 * Platform Owner role required.
 *
 * @function updateAiEndpoint
 * @param {object} req - The Express request object.
 * @param {object} req.user - The authenticated user object.
 * @param {string} req.user.id - The ID of the user performing the action.
 * @param {string} req.user.role - The role of the user performing the action.
 * @param {string} req.params.id - The ID of the endpoint to update.
 * @param {object} req.body - The request body containing update details.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/{id}:
 *   patch:
 *     summary: (Admin) Update an AI endpoint
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponseSuccess'
 *       400:
 *         description: Bad request (e.g., duplicate title).
 *       401:
 *         description: Unauthorized.
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
    // SECURITY FIX: Enforce role-based access control. Only super_admin or platform_owner can update endpoints.
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      return res.status(httpStatus.FORBIDDEN).json({
        status: 'fail',
        message: 'Forbidden: You do not have the required permissions to perform this action.',
      });
    }

    // Prevent changing the unique title to one that already exists
    if (updateData.title) {
      const existingEndpoint = await AiEndpoint.findOne({ title: updateData.title, _id: { $ne: id } }).lean();
      if (existingEndpoint) {
        return res.status(httpStatus.BAD_REQUEST).json({
          status: 'fail',
          message: `An AI endpoint with title '${updateData.title}' already exists.`,
        });
      }
    }

    // If setting this as the new default, unset the current default
    if (updateData.default === true) {
      await AiEndpoint.updateMany({ _id: { $ne: id }, default: true }, { $set: { default: false } });
    }

    const updatedEndpoint = await AiEndpoint.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedEndpoint) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: 'fail',
        message: `AI endpoint with ID '${id}' not found.`,
      });
    }

    // GCP COMPLIANCE: Added 'severity' and 'message' keys for structured logging.
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
    // PATCH: Add detailed system-level error logging.
    logger.error(`Failed to update AI endpoint ${id} in updateAiEndpoint controller:`, error);

    // GCP COMPLIANCE: Added 'severity' and 'message' keys, and structured error details for structured logging.
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to update AI endpoint ${id}. Error: ${error.message}`,
      actor: req.user?.id,
      action: 'update_ai_endpoint',
      resource: id,
      details: { changes: updateData },
      status: 'failure',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });

    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while updating the AI endpoint.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
  }
};

/**
 * Deletes an AI endpoint configuration.
 * Platform Owner role required.
 *
 * @function deleteAiEndpoint
 * @param {object} req - The Express request object.
 * @param {object} req.user - The authenticated user object.
 * @param {string} req.user.id - The ID of the user performing the action.
 * @param {string} req.user.role - The role of the user performing the action.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "AI endpoint deleted successfully." }
 *                 data: { type: object, example: null }
 *       400:
 *         description: Bad request (e.g., trying to delete the default endpoint).
 *       401:
 *         description: Unauthorized.
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
    // SECURITY FIX: Enforce role-based access control. Only super_admin or platform_owner can delete endpoints.
    if (!req.user || !['super_admin', 'platform_owner'].includes(req.user.role)) {
      return res.status(httpStatus.FORBIDDEN).json({
        status: 'fail',
        message: 'Forbidden: You do not have the required permissions to perform this action.',
      });
    }

    // First, find the endpoint to check if it's the default
    const endpointToDelete = await AiEndpoint.findById(id).lean();

    if (!endpointToDelete) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: 'fail',
        message: `AI endpoint with ID '${id}' not found.`,
      });
    }

    // Business logic: Prevent deletion of the default endpoint.
    // A new default must be assigned before the old one can be deleted.
    if (endpointToDelete.default) {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: 'fail',
        message: 'Cannot delete the default AI endpoint. Please set a different endpoint as default before deleting this one.',
      });
    }

    await AiEndpoint.findByIdAndDelete(id);

    // GCP COMPLIANCE: Added 'severity' and 'message' keys for structured logging.
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
    // PATCH: Add detailed system-level error logging.
    logger.error(`Failed to delete AI endpoint ${id} in deleteAiEndpoint controller:`, error);

    // GCP COMPLIANCE: Added 'severity' and 'message' keys, and structured error details for structured logging.
    auditLogger.error({
      severity: 'ERROR',
      message: `Failed to delete AI endpoint ${id}. Error: ${error.message}`,
      actor: req.user?.id,
      action: 'delete_ai_endpoint',
      resource: id,
      status: 'failure',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });

    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while deleting the AI endpoint.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
  }
};

/**
 * @swagger
 * components:
 *   schemas:
 *     AiEndpoint:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated unique identifier of the AI endpoint.
 *           example: "65e6d6b2a7b8c9d0e1f2a3b4"
 *         title:
 *           type: string
 *           description: The unique title of the AI endpoint.
 *           example: "Groq Llama3 Endpoint"
 *         nickName:
 *           type: string
 *           description: A user-friendly nickname for the AI endpoint.
 *           example: "Groq Llama3"
 *         enabled:
 *           type: boolean
 *           description: Whether the endpoint is currently enabled for the platform.
 *           default: false
 *           example: true
 *         default:
 *           type: boolean
 *           description: Whether this endpoint is set as the platform default.
 *           default: false
 *           example: false
 *         add:
 *           type: string
 *           description: The URL or path for adding new AI interactions.
 *           example: "/groq/add-interaction"
 *         history:
 *           type: string
 *           description: The URL or path for retrieving AI interaction history.
 *           example: "/groq/get-history"
 *         delete:
 *           type: string
 *           description: The URL or path for deleting AI interactions.
 *           example: "/groq/delete-interaction"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The date and time when the endpoint was created.
 *           example: "2024-03-04T10:30:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The date and time when the endpoint was last updated.
 *           example: "2024-03-04T11:00:00.000Z"
 *     AiEndpointInput:
 *       type: object
 *       required:
 *         - title
 *         - nickName
 *         - add
 *         - history
 *         - delete
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
 *     ApiResponseFail:
 *       type: object
 *       properties:
 *         status: { type: string, example: "fail" }
 *         message: { type: string }
 *         error: { type: string }
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const getWebAiEndpoint = async (req, res) => {
  try {
    const endpoints = await AiEndpoint.find().lean();
    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI socket endpoints successfully',
      anonymously: '/groq/get-response-anonymously',
      data: endpoints,
    });
  } catch (error) {
    // PATCH: Add detailed system-level error logging.
    logger.error('Failed to fetch web AI endpoints in getWebAiEndpoint controller:', error);
    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while fetching AI endpoints.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
  }
};

const getAiEndpointForApp = async (req, res) => {
  try {
    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Get aiSocketEndpoint successfully',
      anonymously: '/groq/get-response-anonymously',
      data: aiEndpoints,
    });
  } catch (error) {
    // PATCH: Add detailed system-level error logging.
    logger.error('Failed to fetch AI endpoints for app in getAiEndpointForApp controller:', error);
    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while fetching AI endpoints.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
  }
};

const updateWebAiEndpoint = async (req, res) => {
  const { title, enabled, default: isDefault } = req.body;
  if (!title) {
    return res.status(httpStatus.BAD_REQUEST).json({
      status: 'fail',
      message: 'Title is required to identify the AI endpoint.',
    });
  }

  try {
    if (isDefault === true) {
      await AiEndpoint.updateMany({}, { default: false });
    }

    const updatedEndpoint = await AiEndpoint.findOneAndUpdate(
      { title },
      { enabled, default: isDefault },
      { new: true, runValidators: true }
    );

    if (!updatedEndpoint) {
      return res.status(httpStatus.NOT_FOUND).json({
        status: 'fail',
        message: `AI endpoint '${title}' not found.`,
      });
    }

    res.status(httpStatus.OK).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `Updated AI endpoint '${title}' successfully.`,
      data: updatedEndpoint,
    });
  } catch (error) {
    // PATCH: Add detailed system-level error logging.
    logger.error(`Failed to update web AI endpoint with title '${title}' in updateWebAiEndpoint controller:`, error);
    // PATCH: Normalize error response to prevent leaking internal details.
    const apiError = new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal server error occurred while updating the AI endpoint.'
    );
    res.status(apiError.statusCode).json({
      status: 'fail',
      message: apiError.message,
    });
  }
};

/**
 * @namespace AiEndpointsController
 * @description Controller methods for Platform Owner management of AI endpoints.
 */
export const AiEndpointsController = {
  addAiEndpoint,
  getAllAiEndpoints,
  getAiEndpointById,
  updateAiEndpoint,
  deleteAiEndpoint,
  getWebAiEndpoint,
  getAiEndpointForApp,
  updateWebAiEndpoint,
};