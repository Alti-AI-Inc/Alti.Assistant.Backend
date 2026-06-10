import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { conversationHelpers } from './conversation.helpers.js';
import { conversationService } from './conversation.service.js';

/**
 * @summary Create a new conversation
 * @description Allows a logged-in user to create a new conversation with an optional title, initial message, and metadata.
 *   An existing `conversationId` can be provided to link or continue an existing conversation.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user authentication is missing or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations:
 *   post:
 *     summary: Create a new conversation
 *     description: Allows a logged-in user to create a new conversation with an optional initial message and metadata.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Optional title for the conversation.
 *                 example: My New Chat
 *               initialMessage:
 *                 type: string
 *                 description: The first message to be added to the conversation.
 *                 example: Hello, how can I help you today?
 *               metadata:
 *                 type: object
 *                 description: Optional metadata associated with the conversation.
 *                 example: { "source": "web_app" }
 *               conversationId:
 *                 type: string
 *                 description: Optional ID to link to an existing conversation if re-creating or continuing.
 *                 example: 654321098765432109876543
 *     responses:
 *       201:
 *         description: Conversation created successfully.
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
 *                   example: Conversation created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: 654321098765432109876543
 *                     userId:
 *                       type: string
 *                       example: 1234567890abcdef12345678
 *                     title:
 *                       type: string
 *                       example: My New Chat
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: User authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal Server Error.
 */
const createConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { title, initialMessage, metadata, conversationId } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await conversationService.createConversation(
    { userId, title, initialMessage, metadata },
    conversationId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Conversation created successfully',
    data: result,
  });
});

/**
 * @summary Get user conversations with pagination
 * @description Retrieves a list of conversations for the authenticated user, supporting pagination, filtering by status, sorting, and searching.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations:
 *   get:
 *     summary: Get user conversations with pagination
 *     description: Retrieves a list of conversations for the authenticated user, supporting pagination, filtering by status, sorting, and searching.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
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
 *           default: 20
 *         description: Number of conversations per page.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, deleted]
 *           default: active
 *         description: Filter conversations by status.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: lastActivity
 *         description: Field to sort conversations by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: Sort order (1 for ascending, -1 for descending).
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter conversations by title or content.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter conversations by category.
 *       - in: query
 *         name: is_deep_search
 *         schema:
 *           type: boolean
 *         description: Filter conversations that are marked for deep search.
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully.
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
 *                   example: Conversations retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page: { type: number, example: 1 }
 *                         limit: { type: number, example: 20 }
 *                         total: { type: number, example: 50 }
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "654321098765432109876543" }
 *                           title: { type: string, example: "My Conversation" }
 *                           lastActivity: { type: string, format: "date-time" }
 *                           status: { type: string, example: "active" }
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const getUserConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const {
    page = 1,
    limit = 20,
    status = 'active',
    sortBy = 'lastActivity',
    sortOrder = -1,
    search = '',
    category = null,
    is_deep_search = null,
  } = req.query;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    sortBy,
    sortOrder: parseInt(sortOrder),
    search,
    category,
    is_deep_search:
      is_deep_search === 'true'
        ? true
        : is_deep_search === 'false'
          ? false
          : null,
  };

  const result = await conversationHelpers.getUserConversations(
    userId,
    options,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

/**
 * @summary Get a specific conversation by ID
 * @description Retrieves a single conversation belonging to the authenticated user by its ID.
 *   An optional `user_id` can be provided in params for admin or privileged access to fetch conversations of other users.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and optionally user_id.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}:
 *   get:
 *     summary: Get a specific conversation by ID
 *     description: Retrieves a single conversation belonging to the authenticated user by its ID.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve.
 *         example: 654321098765432109876543
 *       - in: path
 *         name: user_id
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional user ID for admin/privileged access to fetch conversations of other users.
 *         example: 1234567890abcdef12345678
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully.
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
 *                   example: Conversation retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     title: { type: string, example: "My Conversation" }
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                     userId: { type: string, example: "1234567890abcdef12345678" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const getConversationById = catchAsync(async (req, res) => {
  let userId = req.user?.userId || req.user?._id;
  const { conversationId, user_id } = req.params;
  if (user_id) {
    userId = user_id; // Use user_id from params if provided
  }
  const result = await conversationHelpers.getConversationById(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation retrieved successfully',
    data: result,
  });
});

/**
 * @summary Get conversation messages with pagination
 * @description Retrieves messages for a specific conversation, supporting pagination and fetching messages before a certain date.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and pagination options in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get conversation messages with pagination
 *     description: Retrieves messages for a specific conversation, supporting pagination and fetching messages before a certain date.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve messages from.
 *         example: 654321098765432109876543
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
 *           default: 50
 *         description: Number of messages per page.
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Retrieve messages sent before this date/time.
 *     responses:
 *       200:
 *         description: Messages retrieved successfully.
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
 *                   example: Messages retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page: { type: number, example: 1 }
 *                         limit: { type: number, example: 50 }
 *                         total: { type: number, example: 100 }
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "msg123" }
 *                           conversationId: { type: string, example: "654321098765432109876543" }
 *                           role: { type: string, example: "user" }
 *                           content: { type: string, example: "Hello there!" }
 *                           createdAt: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const getConversationMessages = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { page = 1, limit = 50, beforeDate } = req.query;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    beforeDate,
  };

  const result = await conversationHelpers.getConversationMessages(
    conversationId,
    userId,
    options,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Messages retrieved successfully',
    data: result,
  });
});

/**
 * @summary Add a message to conversation
 * @description Adds a new message to an existing conversation.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and message details in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/messages:
 *   post:
 *     summary: Add a message to conversation
 *     description: Adds a new message to an existing conversation.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to add the message to.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *               - content
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, assistant, system]
 *                 description: The role of the message sender (e.g., 'user', 'assistant').
 *                 example: user
 *               content:
 *                 type: string
 *                 description: The content of the message.
 *                 example: What is the capital of France?
 *               metadata:
 *                 type: object
 *                 description: Optional metadata associated with the message.
 *                 example: { "source": "user_input" }
 *     responses:
 *       201:
 *         description: Message added successfully.
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
 *                   example: Message added successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "msg123" }
 *                     conversationId: { type: string, example: "654321098765432109876543" }
 *                     role: { type: string, example: "user" }
 *                     content: { type: string, example: "What is the capital of France?" }
 *                     createdAt: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const addMessage = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { role, content, metadata } = req.body;

  const result = await conversationService.addMessageToConversation(
    conversationId,
    userId,
    { role, content, metadata },
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Message added successfully',
    data: result,
  });
});

/**
 * @summary Update conversation title
 * @description Updates the title of a specific conversation.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and new title in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/title:
 *   patch:
 *     summary: Update conversation title
 *     description: Updates the title of a specific conversation.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to update.
 *         example: 654321098765432109876543
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
 *                 description: The new title for the conversation.
 *                 example: Updated Chat Title
 *     responses:
 *       200:
 *         description: Conversation title updated successfully.
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
 *                   example: Conversation title updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     title: { type: string, example: "Updated Chat Title" }
 *                     updatedAt: { type: string, format: "date-time" }
 *       400:
 *         description: Bad Request (e.g., missing title).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const updateTitle = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { title } = req.body;

  const result = await conversationService.updateConversationTitle(
    conversationId,
    userId,
    title,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation title updated successfully',
    data: result,
  });
});

/**
 * @summary Update conversation metadata
 * @description Updates the metadata of a specific conversation.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and new metadata in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/metadata:
 *   patch:
 *     summary: Update conversation metadata
 *     description: Updates the metadata of a specific conversation.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to update.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - metadata
 *             properties:
 *               metadata:
 *                 type: object
 *                 description: The new metadata object for the conversation.
 *                 example: { "source": "mobile_app", "tags": ["important"] }
 *     responses:
 *       200:
 *         description: Conversation metadata updated successfully.
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
 *                   example: Conversation metadata updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     metadata: { type: object, example: { "source": "mobile_app" } }
 *                     updatedAt: { type: string, format: "date-time" }
 *       400:
 *         description: Bad Request (e.g., missing metadata).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const updateMetadata = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { metadata } = req.body;

  const result = await conversationService.updateConversationMetadata(
    conversationId,
    userId,
    metadata,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation metadata updated successfully',
    data: result,
  });
});

/**
 * @summary Archive a conversation
 * @description Archives a specific conversation, changing its status to 'archived'.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/archive:
 *   patch:
 *     summary: Archive a conversation
 *     description: Archives a specific conversation, changing its status to 'archived'.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to archive.
 *         example: 654321098765432109876543
 *     responses:
 *       200:
 *         description: Conversation archived successfully.
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
 *                   example: Conversation archived successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     status: { type: string, example: "archived" }
 *                     updatedAt: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const archiveConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.archiveConversation(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation archived successfully',
    data: result,
  });
});

/**
 * @summary Restore an archived conversation
 * @description Restores a previously archived conversation, changing its status back to 'active'.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/restore:
 *   patch:
 *     summary: Restore an archived conversation
 *     description: Restores a previously archived conversation, changing its status back to 'active'.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to restore.
 *         example: 654321098765432109876543
 *     responses:
 *       200:
 *         description: Conversation restored successfully.
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
 *                   example: Conversation restored successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     status: { type: string, example: "active" }
 *                     updatedAt: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const restoreConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.restoreConversation(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation restored successfully',
    data: result,
  });
});

/**
 * @summary Soft delete a conversation
 * @description Soft deletes a specific conversation, changing its status to 'deleted'.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}:
 *   delete:
 *     summary: Soft delete a conversation
 *     description: Soft deletes a specific conversation, changing its status to 'deleted'.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to soft delete.
 *         example: 654321098765432109876543
 *     responses:
 *       200:
 *         description: Conversation deleted successfully.
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
 *                   example: Conversation deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     status: { type: string, example: "deleted" }
 *                     updatedAt: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const deleteConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.deleteConversation(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation deleted successfully',
    data: result,
  });
});

/**
 * @summary Permanently delete a conversation
 * @description Permanently deletes a specific conversation and all its associated data. This action is irreversible.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/permanently-delete:
 *   delete:
 *     summary: Permanently delete a conversation
 *     description: Permanently deletes a specific conversation and all its associated data. This action is irreversible.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to permanently delete.
 *         example: 654321098765432109876543
 *     responses:
 *       200:
 *         description: Conversation permanently deleted successfully.
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
 *                   example: Conversation permanently deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged: { type: boolean, example: true }
 *                     deletedCount: { type: number, example: 1 }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const permanentlyDeleteConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.permanentlyDeleteConversation(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation permanently deleted successfully',
    data: result,
  });
});

/**
 * @summary Clear conversation messages
 * @description Deletes all messages within a specific conversation, but keeps the conversation record itself.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/clear-messages:
 *   patch:
 *     summary: Clear conversation messages
 *     description: Deletes all messages within a specific conversation, but keeps the conversation record itself.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation whose messages are to be cleared.
 *         example: 654321098765432109876543
 *     responses:
 *       200:
 *         description: Conversation messages cleared successfully.
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
 *                   example: Conversation messages cleared successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged: { type: boolean, example: true }
 *                     deletedCount: { type: number, example: 5 }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const clearMessages = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  const result = await conversationService.clearConversationMessages(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation messages cleared successfully',
    data: result,
  });
});

/**
 * @summary Search conversations
 * @description Searches for conversations based on a search term, optionally filtered by category and limited by count.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing search term and options in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If search term is missing, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/search:
 *   get:
 *     summary: Search conversations
 *     description: Searches for conversations based on a search term, optionally filtered by category and limited by count.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         required: true
 *         schema:
 *           type: string
 *         description: The term to search for within conversation titles or messages.
 *         example: "AI assistant"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Maximum number of search results to return.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Optional category to filter search results.
 *     responses:
 *       200:
 *         description: Search completed successfully.
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
 *                   example: Search completed successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string, example: "654321098765432109876543" }
 *                       title: { type: string, example: "AI Assistant Chat" }
 *                       lastActivity: { type: string, format: "date-time" }
 *       400:
 *         description: Bad Request (e.g., search term is required).
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const searchConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { searchTerm, limit = 10, category } = req.query;

  if (!searchTerm) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Search term is required',
    });
  }

  const result = await conversationHelpers.searchConversations(
    userId,
    searchTerm,
    { limit: parseInt(limit), category },
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Search completed successfully',
    data: result,
  });
});

/**
 * @summary Rename a chat conversation
 * @description Renames the title of an existing chat conversation.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and newTitle in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/rename:
 *   patch:
 *     summary: Rename a chat conversation
 *     description: Renames the title of an existing chat conversation.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to rename.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newTitle
 *             properties:
 *               newTitle:
 *                 type: string
 *                 description: The new title for the conversation.
 *                 example: My Renamed Chat
 *     responses:
 *       200:
 *         description: Conversation renamed successfully.
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
 *                   example: Conversation renamed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     title: { type: string, example: "My Renamed Chat" }
 *                     updatedAt: { type: string, format: "date-time" }
 *       400:
 *         description: Bad Request (e.g., new title is required).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const renameChatConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { newTitle } = req.body;
  if (!newTitle || newTitle.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'New title is required',
    });
  }
  const result = await conversationService.renameChatConversation(
    conversationId,
    userId,
    newTitle.trim(),
    req
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation renamed successfully',
    data: result,
  });
});

/**
 * @summary Save/unsave a chat conversation
 * @description Marks a conversation as saved or unsaved for the user.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and is_saved in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/save:
 *   patch:
 *     summary: Save/unsave a chat conversation
 *     description: Marks a conversation as saved or unsaved for the user.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to save/unsave.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_saved
 *             properties:
 *               is_saved:
 *                 type: boolean
 *                 description: Set to true to save, false to unsave.
 *                 example: true
 *     responses:
 *       200:
 *         description: Conversation saved/unsaved successfully.
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
 *                   example: Conversation saved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     isSaved: { type: boolean, example: true }
 *                     updatedAt: { type: string, format: "date-time" }
 *       400:
 *         description: Bad Request (e.g., missing is_saved).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const saveChatConversation = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { is_saved } = req.body;
  const result = await conversationService.saveChatConversation(
    conversationId,
    userId,
    is_saved,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation saved successfully',
    data: result,
  });
});

/**
 * @summary Get all saved conversations
 * @description Retrieves a paginated list of all conversations marked as saved by the authenticated user.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing pagination options in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user is unauthorized or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/saved:
 *   get:
 *     summary: Get all saved conversations
 *     description: Retrieves a paginated list of all conversations marked as saved by the authenticated user.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 50
 *         description: Number of saved conversations per page.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination.
 *     responses:
 *       200:
 *         description: Saved conversations retrieved successfully.
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
 *                   example: Saved conversations retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page: { type: number, example: 1 }
 *                         limit: { type: number, example: 50 }
 *                         total: { type: number, example: 10 }
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "654321098765432109876543" }
 *                           title: { type: string, example: "My Saved Chat" }
 *                           isSaved: { type: boolean, example: true }
 *                           lastActivity: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const getAllSavedConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { limit = 50, page = 1 } = req.query;

  const result = await conversationHelpers.getAllSavedConversations(
    userId,
    parseInt(limit),
    parseInt(page),
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Saved conversations retrieved successfully',
    data: result,
  });
});

/**
 * @summary Get conversation statistics
 * @description Retrieves statistics related to the user's conversations, such as total count, active, archived, etc.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user is unauthorized or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/stats:
 *   get:
 *     summary: Get conversation statistics
 *     description: Retrieves statistics related to the user's conversations, such as total count, active, archived, etc.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully.
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
 *                   example: Statistics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalConversations: { type: number, example: 100 }
 *                     activeConversations: { type: number, example: 80 }
 *                     archivedConversations: { type: number, example: 15 }
 *                     deletedConversations: { type: number, example: 5 }
 *                     savedConversations: { type: number, example: 10 }
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const getConversationStats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  const result = await conversationHelpers.getConversationStats(userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Statistics retrieved successfully',
    data: result,
  });
});

/**
 * @summary Get conversations by category
 * @description Retrieves conversations filtered by a specific category for the authenticated user, with pagination and sorting options.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing category in params and pagination/sort options in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user is unauthorized or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/category/{category}:
 *   get:
 *     summary: Get conversations by category
 *     description: Retrieves conversations filtered by a specific category for the authenticated user, with pagination and sorting options.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: The category to filter conversations by.
 *         example: "work"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: Number of conversations per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: lastActivity
 *         description: Field to sort conversations by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: Sort order (1 for ascending, -1 for descending).
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully.
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
 *                   example: Conversations retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         limit: { type: number, example: 20 }
 *                         total: { type: number, example: 15 }
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "654321098765432109876543" }
 *                           title: { type: string, example: "Work Project Discussion" }
 *                           category: { type: string, example: "work" }
 *                           lastActivity: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const getConversationsByCategory = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { category } = req.params;
  const { limit = 20, sortBy = 'lastActivity', sortOrder = -1 } = req.query;

  const options = {
    limit: parseInt(limit),
    sortBy,
    sortOrder: parseInt(sortOrder),
  };

  const result = await conversationHelpers.getConversationsByCategory(
    userId,
    category,
    options,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

/**
 * @summary Get recent conversations
 * @description Retrieves a limited number of the most recently active conversations for the authenticated user.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing limit in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user is unauthorized or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/recent:
 *   get:
 *     summary: Get recent conversations
 *     description: Retrieves a limited number of the most recently active conversations for the authenticated user.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 5
 *         description: Maximum number of recent conversations to return.
 *     responses:
 *       200:
 *         description: Recent conversations retrieved successfully.
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
 *                   example: Recent conversations retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string, example: "654321098765432109876543" }
 *                       title: { type: string, example: "Latest Chat" }
 *                       lastActivity: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const getRecentConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { limit = 5 } = req.query;

  const result = await conversationHelpers.getRecentConversations(
    userId,
    parseInt(limit),
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Recent conversations retrieved successfully',
    data: result,
  });
});

/**
 * @summary Bulk archive conversations
 * @description Archives multiple conversations simultaneously for the authenticated user.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing an array of conversation IDs in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If conversationIds is missing or empty, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/bulk-archive:
 *   patch:
 *     summary: Bulk archive conversations
 *     description: Archives multiple conversations simultaneously for the authenticated user.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversationIds
 *             properties:
 *               conversationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of conversation IDs to archive.
 *                 example: ["654321098765432109876543", "654321098765432109876544"]
 *     responses:
 *       200:
 *         description: Conversations archived successfully.
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
 *                   example: Conversations archived successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged: { type: boolean, example: true }
 *                     modifiedCount: { type: number, example: 2 }
 *       400:
 *         description: Bad Request (e.g., conversationIds must be a non-empty array).
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const bulkArchiveConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationIds } = req.body;

  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'conversationIds must be a non-empty array',
    });
  }

  const result = await conversationService.bulkArchiveConversations(
    conversationIds,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations archived successfully',
    data: result,
  });
});

/**
 * @summary Bulk soft delete conversations
 * @description Soft deletes multiple conversations simultaneously for the authenticated user.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing an array of conversation IDs in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If conversationIds is missing or empty, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/bulk-delete:
 *   patch:
 *     summary: Bulk soft delete conversations
 *     description: Soft deletes multiple conversations simultaneously for the authenticated user.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversationIds
 *             properties:
 *               conversationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of conversation IDs to soft delete.
 *                 example: ["654321098765432109876543", "654321098765432109876544"]
 *     responses:
 *       200:
 *         description: Conversations deleted successfully.
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
 *                   example: Conversations deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged: { type: boolean, example: true }
 *                     modifiedCount: { type: number, example: 2 }
 *       400:
 *         description: Bad Request (e.g., conversationIds must be a non-empty array).
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const bulkDeleteConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationIds } = req.body;

  if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'conversationIds must be a non-empty array',
    });
  }

  const result = await conversationService.bulkDeleteConversations(
    conversationIds,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations deleted successfully',
    data: result,
  });
});

/**
 * @summary Get deep search conversations
 * @description Retrieves conversations that have been marked for deep search, supporting pagination, filtering, and sorting.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing pagination and filter options in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user is unauthorized or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/deep-search:
 *   get:
 *     summary: Get deep search conversations
 *     description: Retrieves conversations that have been marked for deep search, supporting pagination, filtering, and sorting.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
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
 *           default: 20
 *         description: Number of conversations per page.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, archived, deleted]
 *           default: active
 *         description: Filter conversations by status.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: lastActivity
 *         description: Field to sort conversations by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: Sort order (1 for ascending, -1 for descending).
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter conversations by title or content.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter conversations by category.
 *     responses:
 *       200:
 *         description: Deep search conversations retrieved successfully.
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
 *                   example: Deep search conversations retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page: { type: number, example: 1 }
 *                         limit: { type: number, example: 20 }
 *                         total: { type: number, example: 5 }
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id: { type: string, example: "654321098765432109876543" }
 *                           title: { type: string, example: "Deep Search Enabled Chat" }
 *                           is_deep_search: { type: boolean, example: true }
 *                           lastActivity: { type: string, format: "date-time" }
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal Server Error.
 */
const getDeepSearchConversations = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const {
    page = 1,
    limit = 20,
    status = 'active',
    sortBy = 'lastActivity',
    sortOrder = -1,
    search = '',
    category = null,
  } = req.query;

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    sortBy,
    sortOrder: parseInt(sortOrder),
    search,
    category,
    is_deep_search: true, // Filter only deep search conversations
  };

  const result = await conversationHelpers.getUserConversations(
    userId,
    options,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Deep search conversations retrieved successfully',
    data: result,
  });
});

/**
 * @summary Add tags to conversation
 * @description Adds one or more tags to a specific conversation.
 * @tags Conversations
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and tags in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the conversation is not found, user is unauthorized, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/tags:
 *   patch:
 *     summary: Add tags to conversation
 *     description: Adds one or more tags to a specific conversation.
 *     tags:
 *       - Conversations
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to add tags to.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tags
 *             properties:
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of tags to add to the conversation.
 *                 example: ["work", "important"]
 *     responses:
 *       200:
 *         description: Tags added successfully.
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
 *                   example: Tags added successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     tags: { type: array, items: { type: string }, example: ["work", "important"] }
 *                     updatedAt: { type: string, format: "date-time" }
 *       400:
 *         description: Bad Request (e.g., tags must be an array).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const addTags = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;
  const { tags } = req.body;

  const result = await conversationService.addConversationTags(
    conversationId,
    userId,
    tags,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tags added successfully',
    data: result,
  });
});

/**
 * @summary Share a chat conversation
 * @description Creates a shareable link for a conversation, allowing it to be viewed by others based on the specified share type and settings.
 * @tags Conversations, Sharing
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and share settings in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user authentication is missing, conversation is not found, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/share:
 *   post:
 *     summary: Share a chat conversation
 *     description: Creates a shareable link for a conversation, allowing it to be viewed by others based on the specified share type and settings.
 *     tags:
 *       - Conversations
 *       - Sharing
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to share.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shareType:
 *                 type: string
 *                 enum: [public, private]
 *                 default: public
 *                 description: The type of sharing (e.g., 'public' for anyone, 'private' for specific users).
 *                 example: public
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Optional date and time when the share link will expire.
 *                 example: 2024-12-31T23:59:59Z
 *               allowComments:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to allow comments on the shared conversation.
 *                 example: true
 *     responses:
 *       200:
 *         description: Chat conversation shared successfully.
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
 *                   example: Chat conversation shared successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     shareId: { type: string, example: "share_abc123" }
 *                     conversationId: { type: string, example: "654321098765432109876543" }
 *                     shareLink: { type: string, example: "https://api.example.com/share/share_abc123" }
 *                     shareType: { type: string, example: "public" }
 *                     expiresAt: { type: string, format: "date-time", nullable: true }
 *                     allowComments: { type: boolean, example: true }
 *                     isActive: { type: boolean, example: true }
 *       401:
 *         description: User authentication required.
 *       404:
 *         description: Conversation not found.
 *       500:
 *         description: Internal Server Error.
 */
const shareChatConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;
  const {
    shareType = 'public',
    expiresAt = null,
    allowComments = false,
  } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await conversationService.shareChatConversation({
    conversationId,
    userId,
    shareType,
    expiresAt,
    allowComments,
    req,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat conversation shared successfully',
    data: result,
  });
});

/**
 * @summary Get shared chat conversation
 * @description Retrieves a shared conversation using its unique share ID. This endpoint can be accessed without authentication if the share type is public.
 * @tags Conversations, Sharing
 * @param {express.Request} req - The Express request object containing shareId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the shared conversation is not found, expired, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/share/{shareId}:
 *   get:
 *     summary: Get shared chat conversation
 *     description: Retrieves a shared conversation using its unique share ID. This endpoint can be accessed without authentication if the share type is public.
 *     tags:
 *       - Conversations
 *       - Sharing
 *     parameters:
 *       - in: path
 *         name: shareId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the shared conversation.
 *         example: share_abc123
 *     responses:
 *       200:
 *         description: Shared chat conversation retrieved successfully.
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
 *                   example: Shared chat conversation retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id: { type: string, example: "654321098765432109876543" }
 *                     title: { type: string, example: "Shared Chat Title" }
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                     shareInfo:
 *                       type: object
 *                       properties:
 *                         shareId: { type: string, example: "share_abc123" }
 *                         shareType: { type: string, example: "public" }
 *                         allowComments: { type: boolean, example: true }
 *       404:
 *         description: Shared conversation not found or inactive.
 *       403:
 *         description: Forbidden (if private share and not authorized).
 *       500:
 *         description: Internal Server Error.
 */
const getSharedChatConversation = catchAsync(async (req, res) => {
  const { shareId } = req.params;

  const result = await conversationService.getSharedChatConversation(shareId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Shared chat conversation retrieved successfully',
    data: result,
  });
});

/**
 * @summary Update share settings for a chat conversation
 * @description Modifies the sharing settings (e.g., share type, expiry, comments, active status) for an already shared conversation.
 * @tags Conversations, Sharing
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params and updated share settings in body.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user authentication is missing, conversation/share is not found, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/share:
 *   patch:
 *     summary: Update share settings for a chat conversation
 *     description: Modifies the sharing settings (e.g., share type, expiry, comments, active status) for an already shared conversation.
 *     tags:
 *       - Conversations
 *       - Sharing
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation whose share settings are to be updated.
 *         example: 654321098765432109876543
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shareType:
 *                 type: string
 *                 enum: [public, private]
 *                 description: The new type of sharing.
 *                 example: private
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: New expiry date and time for the share link. Set to null to remove expiry.
 *                 example: 2025-01-01T00:00:00Z
 *               allowComments:
 *                 type: boolean
 *                 description: Whether to allow comments on the shared conversation.
 *                 example: false
 *               isActive:
 *                 type: boolean
 *                 description: Whether the share link is active. Set to false to revoke.
 *                 example: false
 *     responses:
 *       200:
 *         description: Chat share settings updated successfully.
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
 *                   example: Chat share settings updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     shareId: { type: string, example: "share_abc123" }
 *                     conversationId: { type: string, example: "654321098765432109876543" }
 *                     shareType: { type: string, example: "private" }
 *                     expiresAt: { type: string, format: "date-time", nullable: true }
 *                     allowComments: { type: boolean, example: false }
 *                     isActive: { type: boolean, example: false }
 *       401:
 *         description: User authentication required.
 *       404:
 *         description: Conversation or share not found.
 *       500:
 *         description: Internal Server Error.
 */
const updateChatShareSettings = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;
  const { shareType, expiresAt, allowComments, isActive } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await conversationService.updateChatShareSettings({
    conversationId,
    userId,
    shareType,
    expiresAt,
    allowComments,
    isActive,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat share settings updated successfully',
    data: result,
  });
});

/**
 * @summary Get all shared chats for a user
 * @description Retrieves a paginated list of all conversations that the authenticated user has shared.
 * @tags Conversations, Sharing
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing pagination and status options in query.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user authentication is missing or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/user-shared-chats:
 *   get:
 *     summary: Get all shared chats for a user
 *     description: Retrieves a paginated list of all conversations that the authenticated user has shared.
 *     tags:
 *       - Conversations
 *       - Sharing
 *     security:
 *       - BearerAuth: []
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
 *           default: 20
 *         description: Number of shared chats per page.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, expired]
 *           default: active
 *         description: Filter shared chats by their status.
 *     responses:
 *       200:
 *         description: User shared chats retrieved successfully.
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
 *                   example: User shared chats retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page: { type: number, example: 1 }
 *                         limit: { type: number, example: 20 }
 *                         total: { type: number, example: 5 }
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           shareId: { type: string, example: "share_abc123" }
 *                           conversationId: { type: string, example: "654321098765432109876543" }
 *                           shareLink: { type: string, example: "https://api.example.com/share/share_abc123" }
 *                           shareType: { type: string, example: "public" }
 *                           isActive: { type: boolean, example: true }
 *       401:
 *         description: User authentication required.
 *       500:
 *         description: Internal Server Error.
 */
const getUserSharedChats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { page = 1, limit = 20, status = 'active' } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await conversationService.getUserSharedChats({
    userId,
    page: parseInt(page),
    limit: parseInt(limit),
    status,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User shared chats retrieved successfully',
    data: result,
  });
});

/**
 * @summary Revoke chat share
 * @description Disables sharing for a specific conversation, making its shared link inactive.
 * @tags Conversations, Sharing
 * @security BearerAuth
 * @param {express.Request} req - The Express request object containing conversationId in params.
 * @param {express.Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If user authentication is missing, conversation/share is not found, or an unexpected error occurs.
 *
 * @openapi
 * /api/v1/conversations/{conversationId}/revoke-share:
 *   patch:
 *     summary: Revoke chat share
 *     description: Disables sharing for a specific conversation, making its shared link inactive.
 *     tags:
 *       - Conversations
 *       - Sharing
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation whose share is to be revoked.
 *         example: 654321098765432109876543
 *     responses:
 *       200:
 *         description: Chat share revoked successfully.
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
 *                   example: Chat share revoked successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     shareId: { type: string, example: "share_abc123" }
 *                     conversationId: { type: string, example: "654321098765432109876543" }
 *                     isActive: { type: boolean, example: false }
 *       401:
 *         description: User authentication required.
 *       404:
 *         description: Conversation or share not found.
 *       500:
 *         description: Internal Server Error.
 */
const revokeChatShare = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await conversationService.revokeChatShare({
    conversationId,
    userId,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat share revoked successfully',
    data: result,
  });
});

/**
 * @typedef {Object} ConversationController
 * @property {Function} createConversation - Controller for creating a new conversation.
 * @property {Function} getUserConversations - Controller for getting user conversations with pagination.
 * @property {Function} getConversationById - Controller for getting a specific conversation by ID.
 * @property {Function} getConversationMessages - Controller for getting conversation messages with pagination.
 * @property {Function} addMessage - Controller for adding a message to a conversation.
 * @property {Function} updateTitle - Controller for updating conversation title.
 * @property {Function} updateMetadata - Controller for updating conversation metadata.
 * @property {Function} archiveConversation - Controller for archiving a conversation.
 * @property {Function} restoreConversation - Controller for restoring an archived conversation.
 * @property {Function} deleteConversation - Controller for soft deleting a conversation.
 * @property {Function} permanentlyDeleteConversation - Controller for permanently deleting a conversation.
 * @property {Function} clearMessages - Controller for clearing conversation messages.
 * @property {Function} searchConversations - Controller for searching conversations.
 * @property {Function} getConversationStats - Controller for getting conversation statistics.
 * @property {Function} getConversationsByCategory - Controller for getting conversations by category.
 * @property {Function} getRecentConversations - Controller for getting recent conversations.
 * @property {Function} getDeepSearchConversations - Controller for getting deep search conversations.
 * @property {Function} bulkArchiveConversations - Controller for bulk archiving conversations.
 * @property {Function} bulkDeleteConversations - Controller for bulk soft deleting conversations.
 * @property {Function} addTags - Controller for adding tags to a conversation.
 * @property {Function} shareChatConversation - Controller for sharing a chat conversation.
 * @property {Function} getSharedChatConversation - Controller for getting a shared chat conversation.
 * @property {Function} updateChatShareSettings - Controller for updating share settings for a chat conversation.
 * @property {Function} getUserSharedChats - Controller for getting all shared chats for a user.
 * @property {Function} revokeChatShare - Controller for revoking chat share.
 * @property {Function} renameChatConversation - Controller for renaming a chat conversation.
 * @property {Function} saveChatConversation - Controller for saving/unsaving a chat conversation.
 * @property {Function} getAllSavedConversations - Controller for getting all saved conversations.
 */
export const conversationController = {
  createConversation,
  getUserConversations,
  getConversationById,
  getConversationMessages,
  addMessage,
  updateTitle,
  updateMetadata,
  archiveConversation,
  restoreConversation,
  deleteConversation,
  permanentlyDeleteConversation,
  clearMessages,
  searchConversations,
  getConversationStats,
  getConversationsByCategory,
  getRecentConversations,
  getDeepSearchConversations,
  bulkArchiveConversations,
  bulkDeleteConversations,
  addTags,
  // Share chat methods
  shareChatConversation,
  getSharedChatConversation,
  updateChatShareSettings,
  getUserSharedChats,
  revokeChatShare,
  renameChatConversation,
  saveChatConversation,
  getAllSavedConversations,
};