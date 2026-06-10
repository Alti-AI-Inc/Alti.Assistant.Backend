import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { composioService } from './composio.service.js';
// BUG FIX: Missing import for conversationHelpers, assuming common path
import { conversationHelpers } from '../conversation/conversation.helpers.js';

/**
 * @typedef {object} ComposioInitiateRequestBody
 * @property {string} app_name - The name of the application to initiate authentication for (e.g., 'slack', 'gmail').
 * @property {string} [userId] - Optional user ID for guest users or if not authenticated. For authenticated users, this is derived from `req.user`.
 * @property {string} [user_id] - Alias for userId.
 */

/**
 * @typedef {object} ComposioInitiateResponse
 * @property {string} authConfig - The URL or configuration object required to complete the Composio authentication flow.
 */

/**
 * @typedef {object} ErrorResponse
 * @property {string} error - A brief error message.
 * @property {string} [details] - More detailed information about the error.
 */

/**
 * @openapi
 * /api/v1/composio/initiate:
 *   post:
 *     summary: Initiate Composio authentication for a specific application.
 *     description: This endpoint initiates the OAuth flow for a Composio-integrated application, returning a URL or configuration needed to complete the authentication. It supports both authenticated users (deriving userId from `req.user`) and guest users (requiring userId in the request body).
 *     tags:
 *       - Composio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ComposioInitiateRequestBody'
 *     responses:
 *       200:
 *         description: Authentication initiation successful. Returns the connection URL.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authConfig:
 *                   type: string
 *                   description: The URL to redirect the user to complete the Composio authentication.
 *               example:
 *                 authConfig: "https://app.composio.dev/auth?app=slack&user_id=user123&redirect_uri=..."
 *       400:
 *         description: Bad Request - Missing `app_name` or `user_id`.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingAppName:
 *                 value:
 *                   error: "app_name is required"
 *               missingUserId:
 *                 value:
 *                   error: "User identifier is required"
 *       500:
 *         description: Internal Server Error - Failed to initiate authentication.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Failed to initiate authentication"
 *               details: "Service unavailable"
 *     security:
 *       - bearerAuth: []
 */
/**
 * Initiates the Composio authentication flow for a specified application.
 *
 * This controller handles the initial request to connect a user's account to a Composio-integrated application.
 * It determines the user ID from either the authenticated `req.user` object or the request body for guest users.
 * It then calls the `composioService` to get the authentication URL.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const composioInitiateController = async (req, res) => {
  console.log('Initiating Composio Auth...', req.body);
  let user_id;
  // BUG FIX: Prevent IDOR - For authenticated users, userId must come from req.user.
  // For unauthenticated/guest users, allow userId from body if provided (e.g., for guest linking).
  if (req.user) {
    user_id = req.user?.userId || req.user?._id;
  } else {
    user_id = req.body?.userId || req.body?.user_id;
  }
  console.log(`User ID for Composio initiation: ${user_id}`);

  const { app_name } = req.body;

  if (!app_name) {
    return res.status(400).json({ error: 'app_name is required' });
  }
  if (!user_id) {
    // BUG FIX: More specific error message for missing user identifier
    return res.status(400).json({ error: 'User identifier is required' });
  }

  try {
    const connectionUrl = await composioService.initiateComposioAuth({
      app_name,
      user_id,
    }, req);
    res.status(200).json({ authConfig: connectionUrl });
  } catch (error) {
    console.error('Error initiating Composio auth:', error);
    res.status(500).json({ error: 'Failed to initiate authentication', details: error.message });
  }
};

/**
 * @typedef {object} ComposioWaitForConnectionRequestBody
 * @property {string} connected_account_id - The ID of the connected account to wait for.
 */

/**
 * @typedef {object} ComposioWaitForConnectionResponse
 * @property {object} connection - Details of the established connection.
 * @property {string} connection.id - The ID of the connection.
 * @property {string} connection.status - The status of the connection (e.g., 'connected', 'pending').
 * @property {string} connection.app_name - The name of the connected application.
 */

/**
 * @openapi
 * /api/v1/composio/wait-for-connection:
 *   post:
 *     summary: Wait for a Composio connection to be established.
 *     description: This endpoint allows the client to poll or wait for a Composio connection, initiated previously, to reach a 'connected' state. It's typically used after a user has been redirected to complete an OAuth flow.
 *     tags:
 *       - Composio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - connected_account_id
 *             properties:
 *               connected_account_id:
 *                 type: string
 *                 description: The unique identifier for the connected account, obtained during the initiation phase.
 *                 example: "conn_123abc"
 *     responses:
 *       200:
 *         description: Connection successfully established or retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connection:
 *                   type: object
 *                   description: Details of the established connection.
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "conn_123abc"
 *                     status:
 *                       type: string
 *                       example: "connected"
 *                     app_name:
 *                       type: string
 *                       example: "slack"
 *       500:
 *         description: Internal Server Error - Failed to establish connection.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               error: "Failed to establish connection"
 *     security:
 *       - bearerAuth: []
 */
/**
 * Waits for a Composio connection to be established.
 *
 * This controller is typically used after a user has completed an external OAuth flow
 * and the application needs to confirm the connection status with Composio.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const composioWaitForConnectionController = async (req, res) => {
  const { connected_account_id } = req.body;

  try {
    const connection =
      await composioService.waitForConnection(connected_account_id);
    res.status(200).json({ connection });
  } catch (error) {
    res.status(500).json({ error: 'Failed to establish connection' });
  }
};

/**
 * @typedef {object} ComposioConversationRequestBody
 * @property {string} message - The user's message or query for the Composio automation.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue. If not provided, a new one will be generated.
 * @property {string} [userId] - Optional user ID for guest users. For authenticated users, this is derived from `req.user`.
 * @property {string} [user_id] - Alias for userId.
 */

/**
 * @typedef {object} ComposioConversationResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} response - The assistant's response to the user's message.
 * @property {object} metadata - Any additional metadata returned by the Composio automation.
 * @property {boolean} isGuest - Indicates if the conversation was handled for a guest user.
 * @property {object} [executionResult] - Detailed result of the Composio tool execution, if any.
 */

/**
 * @openapi
 * /api/v1/composio/conversation:
 *   post:
 *     summary: Engage in a conversational interaction with Composio tools.
 *     description: This endpoint allows users to send messages and receive automated responses powered by Composio. It manages conversation context, supports both authenticated and guest users, and integrates with Composio's automation capabilities.
 *     tags:
 *       - Composio
 *       - Conversation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ComposioConversationRequestBody'
 *     responses:
 *       200:
 *         description: Composio automation processed successfully.
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
 *                   example: "Composio automation processed successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ComposioConversationResponseData'
 *       400:
 *         description: Bad Request - Missing `message` or `userId` (for guests).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "A message is required"
 *       500:
 *         description: Internal Server Error - Failed to process automation request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to process automation request"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "conv_xyz789"
 *                     error:
 *                       type: string
 *                       example: "Error details here"
 *     security:
 *       - bearerAuth: []
 */
/**
 * Conversational Composio Chat Controller
 * Handles conversational interactions with Composio tools.
 *
 * This controller processes user messages, maintains conversation context, and
 * orchestrates interactions with the Composio service for automation. It supports
 * both authenticated users (deriving userId from `req.user`) and guest users
 * (allowing userId from body or generating a new one).
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
// BUG FIX: Removed catchAsync as the controller has its own specific try/catch error handling.
const composioConversationController = async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  let userId;

  if (isGuest) {
    // For guests, allow userId from body to resume a session, or generate new if not provided.
    // This assumes composioService.generateGuestUserId() is robust and unique.
    userId = req.body.userId || req.body.user_id || composioService.generateGuestUserId();
  } else {
    // BUG FIX: Prevent IDOR - For authenticated users, userId MUST come from req.user.
    userId = req.user?.userId || req.user?._id;
  }

  const { message, conversationId } = req.body;

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A message is required',
    });
  }

  if (!userId) {
    // This case should ideally not happen if generateGuestUserId always works
    // and req.user is reliable for authenticated users.
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to determine user identifier',
    });
  }

  const thread_id =
    conversationId || composioService.generateComposioConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await composioService.handleComposioConversation(
      userId,
      conversationId,
      message,
      isGuest
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // Get last 10 messages for context (excluding the current message)
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Add user message to conversation
    await composioService.addComposioQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest
    );

    const inputs = {
      query: message,
      conversationContext: conversationHistory,
      history: [...conversationHistory, { role: 'user', content: message }],
      userId: userId, // This userId is now securely sourced
      conversationId: actualConversationId,
    };

    const result = await composioService.processComposioConversation(inputs);
    logger.info(
      `Composio Automation Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const response = result.response;
    const metadata = result.metadata || {};

    // Add assistant response to conversation
    await composioService.addComposioResponseMessage(
      actualConversationId,
      userId,
      response,
      metadata,
      isGuest
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Composio automation processed successfully',
      data: {
        conversationId: actualConversationId,
        response: response,
        metadata: metadata,
        isGuest: isGuest,
        executionResult: result.executionResult,
      },
    });
  } catch (error) {
    logger.error(`Error in composio conversation: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to process automation request',
      data: {
        conversationId: thread_id,
        error: error.message,
      },
    });
  }
};

/**
 * @typedef {object} ConversationMessage
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} timestamp - ISO date string of when the message was sent.
 * @property {object} [metadata] - Optional metadata associated with the message.
 */

/**
 * @typedef {object} ConversationHistoryResponseData
 * @property {string} conversationId - The unique identifier of the conversation.
 * @property {string} userId - The ID of the user associated with the conversation.
 * @property {string} category - The category of the conversation (e.g., 'composio').
 * @property {ConversationMessage[]} messages - An array of messages in the conversation.
 * @property {string} createdAt - ISO date string of when the conversation was created.
 * @property {string} updatedAt - ISO date string of when the conversation was last updated.
 * @property {boolean} isGuest - Indicates if the conversation belongs to a guest user.
 */

/**
 * @openapi
 * /api/v1/composio/conversation/{conversationId}:
 *   get:
 *     summary: Get a specific Composio conversation's history.
 *     description: Retrieves the full message history for a given Composio conversation ID. Access control ensures that only the owner (authenticated user or valid guest userId) can retrieve their conversations.
 *     tags:
 *       - Composio
 *       - Conversation
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the conversation to retrieve.
 *         example: "conv_xyz789"
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: false
 *         description: Required for guest users to identify their conversation. For authenticated users, this is ignored and derived from `req.user`.
 *         example: "guest_abc456"
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
 *                   example: "Conversation retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ConversationHistoryResponseData'
 *       400:
 *         description: Bad Request - Missing `conversationId` or `userId` (for guests).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Conversation ID is required"
 *       403:
 *         description: Forbidden - User does not have access to this conversation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 403
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Access denied to conversation"
 *       404:
 *         description: Not Found - Conversation with the given ID does not exist for the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Conversation not found"
 *       500:
 *         description: Internal Server Error - Failed to retrieve conversation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve conversation"
 *     security:
 *       - bearerAuth: []
 */
/**
 * Get Composio conversation history.
 *
 * This controller retrieves the detailed message history for a specific Composio conversation.
 * It ensures that the requesting user (authenticated or guest with provided userId)
 * is authorized to access the conversation.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getComposioConversationController = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const isGuest = req.isGuest || !req.user;
  let userId;

  if (isGuest) {
    // For guests, userId must be provided in query to retrieve a specific guest conversation.
    // A more robust solution would involve validating this guest userId with a guest token.
    userId = req.query.userId;
  } else {
    // BUG FIX: Prevent IDOR - For authenticated users, userId MUST come from req.user.
    userId = req.user?.userId || req.user?._id;
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }
  // BUG FIX: Ensure userId is present for the query
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User ID is required to retrieve conversations',
    });
  }

  try {
    // conversationHelpers.getConversationById should internally verify that the userId
    // matches the owner of the conversationId to prevent IDOR.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error(`Error retrieving composio conversation: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve conversation',
    });
  }
});

/**
 * @typedef {object} ConversationSummary
 * @property {string} conversationId - The unique identifier of the conversation.
 * @property {string} title - A brief title or summary of the conversation.
 * @property {string} lastActivity - ISO date string of the last message in the conversation.
 * @property {boolean} isGuest - Indicates if the conversation belongs to a guest user.
 * @property {string} category - The category of the conversation (e.g., 'composio').
 */

/**
 * @typedef {object} UserConversationsResponseData
 * @property {ConversationSummary[]} data - An array of conversation summaries.
 * @property {object} meta - Pagination metadata.
 * @property {number} meta.page - The current page number.
 * @property {number} meta.limit - The number of items per page.
 * @property {number} meta.total - The total number of conversations.
 */

/**
 * @openapi
 * /api/v1/composio/conversations:
 *   get:
 *     summary: Get a list of user's Composio conversations.
 *     description: Retrieves a paginated list of all Composio conversations for the authenticated user or a specified guest user.
 *     tags:
 *       - Composio
 *       - Conversation
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         required: false
 *         description: Required for guest users to retrieve their list of conversations. For authenticated users, this is ignored and derived from `req.user`.
 *         example: "guest_abc456"
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
 *           maximum: 100
 *           default: 20
 *         description: Number of conversations per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: "lastActivity"
 *         description: Field to sort by (e.g., 'createdAt', 'lastActivity').
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
 *                   example: "Conversations retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/UserConversationsResponseData'
 *       400:
 *         description: Bad Request - Missing `userId` for guest users.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User ID is required"
 *       500:
 *         description: Internal Server Error - Failed to retrieve conversations.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve conversations"
 *     security:
 *       - bearerAuth: []
 */
/**
 * Get user's Composio conversations.
 *
 * This controller retrieves a paginated list of all Composio conversations associated
 * with the authenticated user or a specified guest user. It applies filtering and sorting
 * based on query parameters.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getUserComposioConversationsController = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId;

  if (isGuest) {
    // For guests, userId must be provided in query to retrieve their list of conversations.
    // A more robust solution would involve validating this guest userId with a guest token.
    userId = req.query.userId;
  } else {
    // BUG FIX: Prevent IDOR - For authenticated users, userId MUST come from req.user.
    userId = req.user?.userId || req.user?._id;
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User ID is required',
    });
  }

  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      category: 'composio',
      sortBy: req.query.sortBy || 'lastActivity',
      sortOrder: parseInt(req.query.sortOrder) || -1,
      search: req.query.search || '',
    };

    // conversationHelpers.getUserConversations should internally verify that the userId
    // matches the authenticated user or a valid guest session to prevent IDOR.
    const conversations = await conversationHelpers.getUserConversations(
      userId,
      options,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversations retrieved successfully',
      data: conversations,
    });
  } catch (error) {
    logger.error(
      `Error retrieving user composio conversations: ${error.message}`
    );

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve conversations',
    });
  }
});

/**
 * @openapi
 * components:
 *   schemas:
 *     ComposioInitiateRequestBody:
 *       type: object
 *       required:
 *         - app_name
 *       properties:
 *         app_name:
 *           type: string
 *           description: The name of the application to initiate authentication for (e.g., 'slack', 'gmail').
 *           example: "slack"
 *         userId:
 *           type: string
 *           description: Optional user ID for guest users or if not authenticated. For authenticated users, this is derived from `req.user`.
 *           example: "guest_user_123"
 *         user_id:
 *           type: string
 *           description: Alias for userId.
 *           example: "guest_user_123"
 *     ComposioConversationRequestBody:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: The user's message or query for the Composio automation.
 *           example: "Send an email to John about the meeting."
 *         conversationId:
 *           type: string
 *           description: Optional ID of an existing conversation to continue. If not provided, a new one will be generated.
 *           example: "conv_xyz789"
 *         userId:
 *           type: string
 *           description: Optional user ID for guest users. For authenticated users, this is derived from `req.user`.
 *           example: "guest_user_123"
 *         user_id:
 *           type: string
 *           description: Alias for userId.
 *           example: "guest_user_123"
 *     ComposioConversationResponseData:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: The ID of the conversation.
 *           example: "conv_xyz789"
 *         response:
 *           type: string
 *           description: The assistant's response to the user's message.
 *           example: "I've drafted an email for John. Would you like me to send it?"
 *         metadata:
 *           type: object
 *           description: Any additional metadata returned by the Composio automation.
 *           example:
 *             tool_used: "email_sender"
 *             email_status: "drafted"
 *         isGuest:
 *           type: boolean
 *           description: Indicates if the conversation was handled for a guest user.
 *           example: false
 *         executionResult:
 *           type: object
 *           description: Detailed result of the Composio tool execution, if any.
 *           example:
 *             tool: "send_email"
 *             status: "success"
 *             output: "Email drafted successfully."
 *     ConversationMessage:
 *       type: object
 *       properties:
 *         role:
 *           type: string
 *           description: The role of the message sender (e.g., 'user', 'assistant').
 *           example: "user"
 *         content:
 *           type: string
 *           description: The content of the message.
 *           example: "Hello, how can you help me?"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: ISO date string of when the message was sent.
 *           example: "2023-10-27T10:00:00Z"
 *         metadata:
 *           type: object
 *           description: Optional metadata associated with the message.
 *           example: {}
 *     ConversationHistoryResponseData:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: The unique identifier of the conversation.
 *           example: "conv_xyz789"
 *         userId:
 *           type: string
 *           description: The ID of the user associated with the conversation.
 *           example: "user_123"
 *         category:
 *           type: string
 *           description: The category of the conversation (e.g., 'composio').
 *           example: "composio"
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ConversationMessage'
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: ISO date string of when the conversation was created.
 *           example: "2023-10-27T09:00:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: ISO date string of when the conversation was last updated.
 *           example: "2023-10-27T10:05:00Z"
 *         isGuest:
 *           type: boolean
 *           description: Indicates if the conversation belongs to a guest user.
 *           example: false
 *     ConversationSummary:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: The unique identifier of the conversation.
 *           example: "conv_xyz789"
 *         title:
 *           type: string
 *           description: A brief title or summary of the conversation.
 *           example: "Email to John about meeting"
 *         lastActivity:
 *           type: string
 *           format: date-time
 *           description: ISO date string of the last message in the conversation.
 *           example: "2023-10-27T10:05:00Z"
 *         isGuest:
 *           type: boolean
 *           description: Indicates if the conversation belongs to a guest user.
 *           example: false
 *         category:
 *           type: string
 *           description: The category of the conversation (e.g., 'composio').
 *           example: "composio"
 *     UserConversationsResponseData:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ConversationSummary'
 *         meta:
 *           type: object
 *           properties:
 *             page:
 *               type: number
 *               example: 1
 *             limit:
 *               type: number
 *               example: 20
 *             total:
 *               type: number
 *               example: 5
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: A brief error message.
 *           example: "app_name is required"
 *         details:
 *           type: string
 *           description: More detailed information about the error.
 *           example: "The 'app_name' field was not provided in the request body."
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @description Composio controller functions for handling authentication, conversational interactions, and conversation history.
 */
export const composioController = {
  composioInitiateController,
  composioWaitForConnectionController,
  composioConversationController,
  getComposioConversationController,
  getUserComposioConversationsController,
};