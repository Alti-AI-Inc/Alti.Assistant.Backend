/**
 * @file Controller for managing AI endpoint configurations.
 * @module app/modules/aiModelServices/aiEndpoint.controller
 * @author Your Name <your.email@example.com>
 */

import httpStatus from 'http-status';
import AiEndpoint from './aiEndpoint.Model.js';
import aiEndpoints from './aiEndpoint.utils.js';

// Optimization Recommendation:
// For improved query performance, especially for `findOne` and `findOneAndUpdate` operations
// that filter by `title`, ensure that the `title` field in the `AiEndpoint` Mongoose schema
// (defined in aiEndpoint.Model.js) has a unique index.
// Example in aiEndpoint.Model.js:
// aiEndpointSchema.index({ title: 1 }, { unique: true });

/**
 * @swagger
 * tags:
 *   name: AI Endpoints
 *   description: API for managing AI model service endpoints
 */

/**
 * Adds a new AI endpoint configuration to the database.
 *
 * @function addAiEndpoint
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing AI endpoint details.
 * @param {string} [req.body.id] - Optional unique identifier for the endpoint (if provided, checked for existence).
 * @param {string} req.body.title - The unique title of the AI endpoint.
 * @param {string} req.body.nickName - A user-friendly nickname for the AI endpoint.
 * @param {boolean} [req.body.enabled=false] - Indicates if the endpoint is enabled.
 * @param {boolean} [req.body.default=false] - Indicates if this is the default AI endpoint.
 * @param {string} req.body.add - The URL or path for adding new AI interactions.
 * @param {string} req.body.history - The URL or path for retrieving AI interaction history.
 * @param {string} req.body.delete - The URL or path for deleting AI interactions.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints:
 *   post:
 *     summary: Add a new AI endpoint
 *     tags: [AI Endpoints]
 *     description: Creates a new AI endpoint configuration in the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - nickName
 *               - add
 *               - history
 *               - delete
 *             properties:
 *               id:
 *                 type: string
 *                 description: Optional unique identifier for the endpoint. If provided, it will be checked for existing entries.
 *                 example: "65e6d6b2a7b8c9d0e1f2a3b4"
 *               title:
 *                 type: string
 *                 description: The unique title of the AI endpoint.
 *                 example: "Groq Llama3 Endpoint"
 *               nickName:
 *                 type: string
 *                 description: A user-friendly nickname for the AI endpoint.
 *                 example: "Groq Llama3"
 *               enabled:
 *                 type: boolean
 *                 description: Whether the endpoint is currently enabled.
 *                 default: false
 *                 example: true
 *               default:
 *                 type: boolean
 *                 description: Whether this endpoint is set as the default.
 *                 default: false
 *                 example: false
 *               add:
 *                 type: string
 *                 description: The URL or path for adding new AI interactions.
 *                 example: "/groq/add-interaction"
 *               history:
 *                 type: string
 *                 description: The URL or path for retrieving AI interaction history.
 *                 example: "/groq/get-history"
 *               delete:
 *                 type: string
 *                 description: The URL or path for deleting AI interactions.
 *                 example: "/groq/delete-interaction"
 *     responses:
 *       201:
 *         description: AI endpoint created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "AI endpoint 'Groq Llama3 Endpoint' created successfully." }
 *                 data:
 *                   $ref: '#/components/schemas/AiEndpoint'
 *       400:
 *         description: Bad request due to missing fields or existing endpoint.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "All fields (title, add, history, delete) are required." }
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "Error creating AI endpoint" }
 *                 error: { type: string, example: "Database connection failed" }
 */
const addAiEndpoint = async (req, res) => {
  try {
    const {
      id,
      title,
      nickName,
      enabled,
      default: isDefault,
      add,
      history,
      delete: deleteUrl,
    } = req.body;

    // Validate required fields
    if (!title || !add || !history || !deleteUrl || !nickName) {
      return res.status(400).json({
        status: 'fail',
        message: 'All fields (title, nickName, add, history, delete) are required.',
      });
    }

    // Check if the title or _id already exists
    // Optimization: Use .lean() for read-only queries to get plain JavaScript objects.
    // Also, only query by _id if a valid 24-character hex string is provided to prevent CastError.
    const query = id && typeof id === 'string' && id.length === 24
      ? { $or: [{ title }, { _id: id }] }
      : { title };

    const existingEndpoint = await AiEndpoint.findOne(query).lean();

    if (existingEndpoint) {
      return res.status(400).json({
        status: 'fail',
        message: `AI endpoint with ${existingEndpoint.title ? `'${existingEndpoint.title}'` : `'${existingEndpoint._id}'`} already exists.`,
      });
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

    res.status(201).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `AI endpoint '${title}' created successfully.`,
      data: newEndpoint,
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: 'Error creating AI endpoint',
      error: error.message,
    });
  }
};

/**
 * Retrieves all AI endpoint configurations from the database for web display.
 *
 * @function getWebAiEndpoint
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/web:
 *   get:
 *     summary: Get all AI endpoints for web display
 *     tags: [AI Endpoints]
 *     description: Fetches all AI endpoint configurations stored in the database.
 *     responses:
 *       200:
 *         description: Successfully fetched AI socket endpoints.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "Fetched AI socket endpoints successfully" }
 *                 anonymously: { type: string, example: "/groq/get-response-anonymously" }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AiEndpoint'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "Error fetching AI endpoints" }
 *                 error: { type: string, example: "Database connection failed" }
 */
const getWebAiEndpoint = async (req, res) => {
  try {
    // Optimization: Use .lean() for read-only queries to get plain JavaScript objects,
    // which bypasses Mongoose document instantiation overhead.
    const aiEndpoints = await AiEndpoint.find().lean(); // Fetch from DB
    res.status(200).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Fetched AI socket endpoints successfully',
      anonymously: '/groq/get-response-anonymously',
      data: aiEndpoints,
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: 'Error fetching AI endpoints',
      error: error.message,
    });
  }
};

/**
 * Retrieves a predefined list of AI endpoint configurations for application use.
 * This function returns a static list from `aiEndpoint.utils.js`, not from the database.
 *
 * @function getAiEndpointForApp
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints/app:
 *   get:
 *     summary: Get AI endpoints for application use (static list)
 *     tags: [AI Endpoints]
 *     description: Retrieves a predefined, static list of AI endpoint configurations for direct application consumption. This list is not fetched from the database.
 *     responses:
 *       200:
 *         description: Successfully retrieved AI socket endpoints.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "Get aiSocketEndpoint successfully" }
 *                 anonymously: { type: string, example: "/groq/get-response-anonymously" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title: { type: string, example: "Groq Llama3" }
 *                       add: { type: string, example: "/groq/add-interaction" }
 *                       history: { type: string, example: "/groq/get-history" }
 *                       delete: { type: string, example: "/groq/delete-interaction" }
 *                       enabled: { type: boolean, example: true }
 *                       default: { type: boolean, example: false }
 *       400:
 *         description: Error retrieving AI socket endpoints.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "Couldn't not get aiSocketEndpoint" }
 *                 error: { type: string, example: "An unexpected error occurred." }
 */
const getAiEndpointForApp = async (req, res) => {
  try {
    res.status(200).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: 'Get aiSocketEndpoint successfully',
      anonymously: '/groq/get-response-anonymously',
      data: aiEndpoints,
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: "Couldn't not get aiSocketEndpoint",
      error: error.message,
    });
  }
};

/**
 * Updates an existing AI endpoint configuration in the database.
 *
 * @function updateWebAiEndpoint
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing update details.
 * @param {string} req.body.title - The unique title of the AI endpoint to update.
 * @param {boolean} [req.body.enabled] - New enabled status for the endpoint.
 * @param {boolean} [req.body.default] - New default status for the endpoint. If true, all other endpoints will be set to non-default.
 * @param {object} res - The Express response object.
 * @returns {Promise<void>} A Promise that resolves when the response is sent.
 *
 * @swagger
 * /api/ai-endpoints:
 *   patch:
 *     summary: Update an existing AI endpoint
 *     tags: [AI Endpoints]
 *     description: Updates the `enabled` and `default` status of an existing AI endpoint identified by its title. If `default` is set to true, all other endpoints will have their `default` status set to false.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: The unique title of the AI endpoint to update.
 *                 example: "Groq Llama3 Endpoint"
 *               enabled:
 *                 type: boolean
 *                 description: The new enabled status for the endpoint.
 *                 example: false
 *               default:
 *                 type: boolean
 *                 description: The new default status for the endpoint. If true, all other endpoints will be set to non-default.
 *                 example: true
 *     responses:
 *       200:
 *         description: AI endpoint updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 status: { type: string, example: "Success" }
 *                 message: { type: string, example: "Updated AI endpoint 'Groq Llama3 Endpoint' successfully." }
 *                 data:
 *                   $ref: '#/components/schemas/AiEndpoint'
 *       400:
 *         description: Bad request due to missing title.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "Title is required to identify the AI endpoint." }
 *       404:
 *         description: AI endpoint not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "AI endpoint 'Groq Llama3 Endpoint' not found." }
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "fail" }
 *                 message: { type: string, example: "Error updating AI endpoint" }
 *                 error: { type: string, example: "Database connection failed" }
 */
const updateWebAiEndpoint = async (req, res) => {
  try {
    const { title, enabled, default: isDefault } = req.body;

    if (!title) {
      return res.status(400).json({
        status: 'fail',
        message: 'Title is required to identify the AI endpoint.',
      });
    }

    // If isDefault is true, first set all other AI endpoints to false
    if (isDefault === true) {
      // Optimization: Only update documents where `default` is currently true,
      // avoiding a full collection write scan. For large collections, a sparse
      // index on the `default` field will significantly improve performance.
      // Example in aiEndpoint.Model.js:
      // aiEndpointSchema.index({ default: 1 }, { sparse: true });
      await AiEndpoint.updateMany({ default: true }, { default: false });
    }

    // Update the AI endpoint without modifying the title
    // Optimization: Ensure an index exists on the 'title' field for efficient lookup.
    // Optimization: Use .lean() to return a plain JavaScript object instead of a full Mongoose document.
    const updatedEndpoint = await AiEndpoint.findOneAndUpdate(
      { title }, // Find by title
      { enabled, default: isDefault }, // Only update enabled & default
      { new: true, runValidators: true }
    ).lean();

    if (!updatedEndpoint) {
      return res.status(404).json({
        status: 'fail',
        message: `AI endpoint '${title}' not found.`,
      });
    }

    res.status(200).json({
      statusCode: httpStatus.OK,
      status: 'Success',
      message: `Updated AI endpoint '${title}' successfully.`,
      data: updatedEndpoint,
    });
  } catch (error) {
    res.status(500).json({
      status: 'fail',
      message: 'Error updating AI endpoint',
      error: error.message,
    });
  }
};

/**
 * @swagger
 * components:
 *   schemas:
 *     AiEndpoint:
 *       type: object
 *       required:
 *         - title
 *         - nickName
 *         - add
 *         - history
 *         - delete
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
 *           description: Whether the endpoint is currently enabled.
 *           default: false
 *           example: true
 *         default:
 *           type: boolean
 *           description: Whether this endpoint is set as the default.
 *           default: false
           example: false
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
 */

/**
 * @namespace AiEndpointsController
 * @description Controller methods for managing AI endpoint configurations.
 * This object groups all the route handlers related to AI endpoints.
 */
export const AiEndpointsController = {
  addAiEndpoint,
  getAiEndpointForApp,
  getWebAiEndpoint,
  updateWebAiEndpoint,
};