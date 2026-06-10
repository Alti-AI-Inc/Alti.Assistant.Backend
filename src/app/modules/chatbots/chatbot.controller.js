import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { chatbotService } from './chatbot.service.js';

/**
 * @swagger
 * /api/v1/chatbots:
 *   post:
 *     summary: Create a new chatbot
 *     description: Allows an authenticated user to create a new chatbot. The chatbot will be associated with the authenticated user. Creation may be subject to plan limits.
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
 *                   $ref: '#/components/schemas/Chatbot'
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
 *         description: Forbidden - User's plan limit for chatbots has been reached.
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
 *     summary: Retrieve chatbots for the current workspace
 *     description: Fetches a list of chatbots within the authenticated user's workspace. Managers and admins can see all chatbots, while users can only see their own. Supports filtering, pagination, and sorting.
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
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Chatbot'
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
 * Handles the retrieval of all chatbots for the authenticated user's workspace.
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
    ...result, // Service layer should return { meta, data }
  });
});

/**
 * @swagger
 * /api/v1/chatbots/{id}:
 *   get:
 *     summary: Retrieve a single chatbot by ID
 *     description: Fetches a specific chatbot by its ID, ensuring it belongs to the authenticated user's workspace.
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
 *                   $ref: '#/components/schemas/Chatbot'
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - User does not have access to this chatbot.
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
 *     description: Updates the details of an existing chatbot identified by its ID. Only users with appropriate permissions (e.g., owner, manager) can update.
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
 *                   $ref: '#/components/schemas/Chatbot'
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
 *         description: Forbidden - User does not have permission to update this chatbot.
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
 *     description: Deletes a chatbot identified by its ID. Only users with appropriate permissions (e.g., owner, manager) can delete.
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
 *                   $ref: '#/components/schemas/Chatbot'
 *       401:
 *         description: Unauthorized - No authentication token or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - User does not have permission to delete this chatbot.
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

// --- Manager Dashboard Features ---

/**
 * @swagger
 * /api/v1/manager/metrics:
 *   get:
 *     summary: Retrieve workspace metrics for a manager
 *     description: Fetches key metrics for the manager's workspace, such as chatbot count, conversations, and team member activity. This endpoint is restricted to users with a 'manager' or 'admin' role.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace metrics retrieved successfully.
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
 *                   example: Workspace metrics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalChatbots:
 *                       type: integer
 *                       example: 15
 *                     activeChatbots:
 *                       type: integer
 *                       example: 12
 *                     totalConversations:
 *                       type: integer
 *                       example: 1250
 *                     teamSize:
 *                       type: integer
 *                       example: 5
 *                     planUsage:
 *                       type: object
 *                       description: "Current usage against plan limits. Does not expose sensitive billing info."
 *                       properties:
 *                         chatbots:
 *                           type: string
 *                           example: "15/20"
 *                         teamMembers:
 *                           type: string
 *                           example: "5/10"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - User is not a manager or admin.
 *       500:
 *         description: Internal Server Error
 */
const getWorkspaceMetrics = catchAsync(async (req, res) => {
  // The service layer will use the user context to find the correct workspace,
  // verify that the user has the 'manager' or 'admin' role, and aggregate metrics.
  // It will also ensure no sensitive billing information is exposed.
  const result = await chatbotService.getWorkspaceMetrics(req.user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Workspace metrics retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/manager/team:
 *   get:
 *     summary: Retrieve team members for the manager's workspace
 *     description: Fetches a list of all members in the manager's workspace, including their roles. Restricted to 'manager' or 'admin' roles.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team members retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                         enum: [admin, manager, user]
 *                       status:
 *                         type: string
 *                         enum: [active, pending_invitation]
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
const getTeamMembers = catchAsync(async (req, res) => {
  const result = await chatbotService.getTeamMembers(req.user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team members retrieved successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/manager/invitations:
 *   post:
 *     summary: Invite a new member to the workspace
 *     description: Sends an invitation email to a new member to join the manager's workspace. Checks against plan limits for team size. Restricted to 'manager' or 'admin' roles.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email of the user to invite.
 *               role:
 *                 type: string
 *                 enum: [manager, user]
 *                 description: Role to assign to the new member.
 *     responses:
 *       201:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Bad Request (e.g., user already in workspace, invalid email).
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (e.g., not a manager, or plan limit exceeded).
 */
const inviteTeamMember = catchAsync(async (req, res) => {
  const { email, role } = req.body;
  // The service layer will handle the logic of creating an invitation,
  // sending the email, and checking plan limits based on the manager's user context.
  await chatbotService.inviteTeamMember(req.user, email, role);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Invitation sent successfully',
    data: null,
  });
});

/**
 * @swagger
 * /api/v1/manager/team/{memberId}/role:
 *   patch:
 *     summary: Update a team member's role
 *     description: Updates the role of an existing member in the workspace. Restricted to 'manager' or 'admin' roles. A manager cannot change their own role or the role of the workspace owner (admin).
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the team member to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [manager, user]
 *                 description: The new role for the team member.
 *     responses:
 *       200:
 *         description: Member role updated successfully.
 *       400:
 *         description: Bad Request (e.g., invalid role).
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (e.g., trying to update owner, not a manager).
 *       404:
 *         description: Not Found (member not in workspace).
 */
const updateTeamMemberRole = catchAsync(async (req, res) => {
  const { memberId } = req.params;
  const { role } = req.body;
  // Service layer handles permissions: is the requester a manager?
  // Is the target user in the same workspace? Is the requester trying to demote an admin?
  const result = await chatbotService.updateTeamMemberRole(req.user, memberId, role);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member role updated successfully',
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
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getWorkspaceMetrics - Controller for managers to view workspace metrics.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTeamMembers - Controller for managers to view their team.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} inviteTeamMember - Controller for managers to invite new members.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updateTeamMemberRole - Controller for managers to update member roles.
 */

/**
 * Exports an object containing all chatbot and manager controller functions.
 * @type {ChatbotController}
 */
export const chatbotController = {
  createChatbot,
  getChatbots,
  getChatbotById,
  updateChatbot,
  deleteChatbot,
  // Manager Dashboard Controllers
  getWorkspaceMetrics,
  getTeamMembers,
  inviteTeamMember,
  updateTeamMemberRole,
};