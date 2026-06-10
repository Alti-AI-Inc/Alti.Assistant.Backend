import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { chatbotService } from './chatbot.service.js';

/**
 * @swagger
 * /api/v1/chatbots:
 *   post:
 *     summary: Create a new chatbot
 *     description: Allows an authenticated user to create a new chatbot. The chatbot will be associated with the authenticated user.
 *     tags:
 *       - Chatbots
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the chatbot.
 *                 example: My Customer Support Bot
 *               description:
 *                 type: string
 *                 description: A brief description of the chatbot's purpose.
 *                 example: This bot handles common customer inquiries and FAQs.
 *               // Add other relevant chatbot properties here if they exist in the schema
 *     responses:
 *       201:
 *         description: Chatbot created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chatbot created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *                     name:
 *                       type: string
 *                       example: "My Customer Support Bot"
 *                     description:
 *                       type: string
 *                       example: "This bot handles common customer inquiries and FAQs."
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad Request - Invalid input data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Handles the creation of a new chatbot.
 * Extracts chatbot data from the request body and the user context from the authenticated user.
 * Calls the chatbot service to create the chatbot and sends a success response.
 *
 * @param {import('express').Request} req - The Express request object, containing the chatbot data in `req.body` and user context in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const createChatbot = catchAsync(async (req, res) => {
  // Pass the entire user context (req.user) to the service layer to allow proper validation of roles
  // (super_admin, admin, manager, user), tenant context boundaries, and propagation of usage/limits.
  const result = await chatbotService.createChatbot(req.body, req.user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Chatbot created successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/chatbots:
 *   get:
 *     summary: Retrieve all chatbots for the authenticated user
 *     description: Fetches a list of all chatbots owned by the authenticated user. Supports filtering, pagination, and sorting via query parameters.
 *     tags:
 *       - Chatbots
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           example: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending).
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           example: support
 *         description: Search term to filter chatbots by name or description.
 *       # Add other potential query parameters for filtering if applicable
 *     responses:
 *       200:
 *         description: Chatbots retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chatbots retrieved successfully
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: number
 *                       example: 1
 *                     limit:
 *                       type: number
 *                       example: 10
 *                     total:
 *                       type: number
 *                       example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *                       name:
 *                         type: string
 *                         example: "My Customer Support Bot"
 *                       description:
 *                         type: string
 *                         example: "This bot handles common customer inquiries and FAQs."
 *                       userId:
 *                         type: string
 *                         example: "user123"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Handles the retrieval of all chatbots for the authenticated user.
 * Extracts the user context from the authenticated user and query parameters for filtering/pagination.
 * Calls the chatbot service to get the chatbots and sends a success response.
 *
 * @param {import('express').Request} req - The Express request object, containing user context in `req.user` and query parameters in `req.query`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getChatbots = catchAsync(async (req, res) => {
  // Pass the entire user context (req.user) to enforce tenant boundaries and role-based visibility.
  const result = await chatbotService.getChatbots(req.user, req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbots retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/chatbots/{id}:
 *   get:
 *     summary: Retrieve a single chatbot by ID
 *     description: Fetches a specific chatbot by its ID, ensuring it belongs to the authenticated user.
 *     tags:
 *       - Chatbots
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the chatbot to retrieve.
 *         example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *     responses:
 *       200:
 *         description: Chatbot retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chatbot retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *                     name:
 *                       type: string
 *                       example: "My Customer Support Bot"
 *                     description:
 *                       type: string
 *                       example: "This bot handles common customer inquiries and FAQs."
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - User does not own this chatbot.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found - Chatbot with the specified ID not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Handles the retrieval of a single chatbot by its ID.
 * Extracts the chatbot ID from `req.params` and the user context from the authenticated user.
 * Calls the chatbot service to get the specific chatbot and sends a success response.
 *
 * @param {import('express').Request} req - The Express request object, containing chatbot ID in `req.params.id` and user context in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getChatbotById = catchAsync(async (req, res) => {
  // Pass the entire user context (req.user) to allow role-based access control and tenant checks.
  const result = await chatbotService.getChatbotById(req.params.id, req.user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/chatbots/{id}:
 *   patch:
 *     summary: Update an existing chatbot
 *     description: Updates the details of an existing chatbot identified by its ID. Only the owner can update their chatbots.
 *     tags:
 *       - Chatbots
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the chatbot to update.
 *         example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the chatbot.
 *                 example: Updated Customer Support Bot
 *               description:
 *                 type: string
 *                 description: The new description for the chatbot.
 *                 example: This bot now includes advanced AI features.
 *               // Add other updatable chatbot properties here
 *     responses:
 *       200:
 *         description: Chatbot updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chatbot updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *                     name:
 *                       type: string
 *                       example: "Updated Customer Support Bot"
 *                     description:
 *                       type: string
 *                       example: "This bot now includes advanced AI features."
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad Request - Invalid input data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - User does not own this chatbot.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found - Chatbot with the specified ID not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Handles the update of an existing chatbot.
 * Extracts the chatbot ID from `req.params`, the user context from the authenticated user, and update data from `req.body`.
 * Calls the chatbot service to update the chatbot and sends a success response.
 *
 * @param {import('express').Request} req - The Express request object, containing chatbot ID in `req.params.id`, user context in `req.user`, and update data in `req.body`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const updateChatbot = catchAsync(async (req, res) => {
  // Pass the entire user context (req.user) to allow role-based validation and tenant checks.
  const result = await chatbotService.updateChatbot(req.params.id, req.user, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot updated successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/chatbots/{id}:
 *   delete:
 *     summary: Delete a chatbot
 *     description: Deletes a chatbot identified by its ID. Only the owner can delete their chatbots.
 *     tags:
 *       - Chatbots
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the chatbot to delete.
 *         example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *     responses:
 *       200:
 *         description: Chatbot deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Chatbot deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "65e7a9b0d3f4e5a6b7c8d9e0"
 *                     name:
 *                       type: string
 *                       example: "Deleted Chatbot"
 *                     // Other properties of the deleted chatbot, or a confirmation message
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - User does not own this chatbot.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found - Chatbot with the specified ID not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Handles the deletion of a chatbot.
 * Extracts the chatbot ID from `req.params` and the user context from the authenticated user.
 * Calls the chatbot service to delete the chatbot and sends a success response.
 *
 * @param {import('express').Request} req - The Express request object, containing chatbot ID in `req.params.id` and user context in `req.user`.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const deleteChatbot = catchAsync(async (req, res) => {
  // Pass the entire user context (req.user) to allow role-based validation and tenant checks.
  const result = await chatbotService.deleteChatbot(req.params.id, req.user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chatbot deleted successfully',
    data: result,
  });
});

/**
 * @typedef {object} ChatbotController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} createChatbot - Controller function to create a new chatbot.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getChatbots - Controller function to retrieve all chatbots for the authenticated user.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getChatbotById - Controller function to retrieve a single chatbot by ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updateChatbot - Controller function to update an existing chatbot.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteChatbot - Controller function to delete a chatbot.
 */

/**
 * Exports an object containing all chatbot controller functions.
 * @type {ChatbotController}
 */
export const chatbotController = {
  createChatbot,
  getChatbots,
  getChatbotById,
  updateChatbot,
  deleteChatbot,
};