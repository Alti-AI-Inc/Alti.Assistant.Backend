import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import Tool from '../composio_v2/tools.model.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { composioService } from './composio.service.js';
import {
  conversationService,
  generateConversationId,
} from './composio.conversation.js';
// HIERARCHY_GAP_FIX: Import Workspace model to enforce tenant-level controls and subscription checks.
import Workspace from '../workspace/workspace.model.js';
// HIERARCHY_GAP_FIX: Import a dedicated usage service to track and propagate usage details.
import { usageService } from '../usage/usage.service.js';

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} string The string to escape.
 * @returns {string} The escaped string.
 */
const escapeRegExp = string => {
  // BUG_FIX: The original replacement logic was incorrect.
  // The '\\{FILE_CONTENT}' replacement pattern correctly inserts the matched special character,
  // prefixed with a backslash, effectively escaping it. For example, '.' becomes '\.'.
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\{FILE_CONTENT}');
};

/**
 * @openapi
 * /api/v1/composio-simple/chat:
 *   post:
 *     summary: Process a user's chat message and execute actions
 *     description: >
 *       Handles user messages, orchestrates tool execution via Composio,
 *       manages conversation history, and enforces workspace usage limits.
 *       This is the primary interaction endpoint.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message or query.
 *                 example: "Create a new Trello card named 'Deploy to production' in the 'Engineering' board."
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue. A new one is created if omitted.
 *                 example: "conv_123456789"
 *               scopedApp:
 *                 type: string
 *                 description: Optional app name to scope the tool execution to a specific integration (e.g., 'trello').
 *                 example: "trello"
 *     responses:
 *       '200':
 *         description: Request processed successfully. The response contains the assistant's reply and execution details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                     toolsUsed:
 *                       type: array
 *                     executionTime:
 *                       type: number
 *                     conversationId:
 *                       type: string
 *       '400':
 *         description: Bad Request - The 'message' field is missing.
 *       '401':
 *         description: Unauthorized - User authentication context is missing or incomplete.
 *       '403':
 *         description: Forbidden - The workspace has reached its usage limit or has no active subscription.
 *       '500':
 *         description: Internal Server Error - An unexpected error occurred while processing the request.
 */
/**
 * @description Main chat endpoint - handles user messages and executes actions.
 * @permission Authenticated users.
 * @multitenant This endpoint is multi-tenant. All operations, including conversation management and usage tracking, are scoped to the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const chatController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: Destructure full user context including role and workspace.
  // This assumes an auth middleware populates req.user with { userId, role, workspaceId }.
  const { userId, workspaceId, role } = req.user;
  const { message, conversationId, scopedApp } = req.body;

  // Validate input
  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  // SECURITY_FIX: Centralized and robust check for authenticated user context.
  if (!userId || !workspaceId || !role) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication context is incomplete.',
    });
  }

  // HIERARCHY_GAP_FIX: Subscription and usage limits are checked at the workspace level, not per-user.
  // This ensures usage is aggregated for the entire team/workspace.
  const workspace = await Workspace.findById(workspaceId).populate('subscription').lean();
  if (!workspace || !workspace.subscription) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Workspace or subscription not found.',
      });
  }

  if (workspace.subscription.usage <= 0) {
    // HIERARCHY_GAP_FIX: In a real implementation, the usage service would handle notifying admins.
    // Example: await usageService.notifyAdmins(workspaceId, 'usage_limit_reached');
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'Your workspace has reached its usage limit. Please contact your administrator to upgrade.',
    });
  }


  try {
    // Get or create conversation
    const activeConversationId = conversationId || generateConversationId();
    // HIERARCHY_GAP_FIX & IDOR_FIX: All data access is scoped by workspaceId to enforce tenant boundaries.
    // The service layer must use workspaceId to ensure a user from workspace A cannot access conversations in workspace B.
    const conversation = await conversationService.getOrCreateConversation(
      userId,
      workspaceId, // Pass workspaceId for tenant isolation
      activeConversationId,
      message
    );

    // HIERARCHY_GAP_FIX & IDOR_FIX: Ensure message saving is also scoped by workspace.
    await conversationService.saveMessage(
      conversation.conversationId,
      userId,
      workspaceId, // Pass workspaceId for tenant isolation
      'user',
      message
    );

    // HIERARCHY_GAP_FIX: Pass workspaceId to the core service to ensure any actions
    // (e.g., API calls via Composio) are performed within the workspace's context and permissions.
    const result = await composioService.executeUserRequest(
      message,
      userId,
      workspaceId, // Pass workspaceId for tenant isolation
      conversation.conversationId,
      scopedApp
    );


    if (result.success) {
      // HIERARCHY_GAP_FIX: Record successful usage against the workspace.
      // This service would handle decrementing limits atomically and triggering notifications if thresholds are crossed.
      await usageService.recordUsage({
        workspaceId,
        userId,
        type: 'chat_execution',
        metadata: { toolsUsed: result.data.toolsUsed?.length || 0 },
      });

      // HIERARCHY_GAP_FIX & IDOR_FIX: Ensure message saving is also scoped by workspace.
      await conversationService.saveMessage(
        conversation.conversationId,
        userId,
        workspaceId, // Pass workspaceId for tenant isolation
        'assistant',
        result.data.response,
        {
          toolsUsed: result.data.toolsUsed || [],
          executionTime: result.data.executionTime,
        }
      );

      logger.info(`Composio Simple: Successful execution for user ${userId} in workspace ${workspaceId}`);

      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          ...result.data,
          conversationId: conversation.conversationId,
        },
      });
    } else {
      // HIERARCHY_GAP_FIX & IDOR_FIX: Ensure even error messages are saved within the correct tenant context.
      await conversationService.saveMessage(
        conversation.conversationId,
        userId,
        workspaceId, // Pass workspaceId for tenant isolation
        'assistant',
        `Error: ${result.error}`,
        { error: true }
      );

      logger.error(
        `Composio Simple: Failed execution for user ${userId} in workspace ${workspaceId}: ${result.error}`
      );

      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to process request',
        data: process.env.NODE_ENV !== 'production' ? result.data : null,
      });
    }
  } catch (error) {
    logger.error(`Composio Simple: Error in chat controller for user ${userId}: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An unexpected error occurred',
      data: {
        error: process.env.NODE_ENV !== 'production' ? error.message : 'Internal Server Error',
      },
    });
  }
});

/**
 * @openapi
 * /api/v1/composio-simple/initiate-auth:
 *   post:
 *     summary: Initiate authentication for a new app
 *     description: Starts the OAuth or API key connection process for a specified application via Composio.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - app_name
 *             properties:
 *               app_name:
 *                 type: string
 *                 description: The unique name of the app to connect (e.g., 'github', 'trello').
 *                 example: "trello"
 *     responses:
 *       '200':
 *         description: Authentication initiated successfully. The response contains the authorization URL.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 redirect_url:
 *                   type: string
 *                   format: uri
 *                 connected_account_id:
 *                   type: string
 *       '400':
 *         description: Bad Request - The 'app_name' is missing, or the Composio API key is invalid.
 *       '500':
 *         description: Internal Server Error - Failed to initiate the authentication flow.
 */
/**
 * @description Initiate app authentication.
 * @permission Authenticated users.
 * @multitenant The new app connection will be associated with the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const initiateAuthController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: Actions must be performed within the user's tenant context.
  const { userId, workspaceId } = req.user;
  const { app_name } = req.body;

  if (!app_name) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'App name is required',
    });
  }

  // HIERARCHY_GAP_FIX: Pass workspaceId to the service layer to associate the
  // new connection with the correct tenant.
  const result = await composioService.initiateAuth(app_name, userId, workspaceId);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Authentication initiated',
      data: result.data,
    });
  } else {
    const isApiKeyError = result.error && (
      result.error.includes('Invalid API key') ||
      result.error.includes('AuthenticationError')
    );

    const statusCode = isApiKeyError ? httpStatus.BAD_REQUEST : httpStatus.INTERNAL_SERVER_ERROR;
    const message = isApiKeyError
      ? "Failed to connect to Composio. Please verify that your COMPOSIO_API_KEY is valid and configured."
      : 'Failed to initiate authentication';

    return sendResponse(res, {
      statusCode,
      success: false,
      message,
      data: { error: process.env.NODE_ENV !== 'production' ? result.error : message },
    });
  }
});

/**
 * @openapi
 * /api/v1/composio-simple/disconnect-app:
 *   post:
 *     summary: Disconnect an integrated app
 *     description: Removes an active app integration for the user's workspace.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - app_name
 *             properties:
 *               app_name:
 *                 type: string
 *                 description: The unique name of the app to disconnect.
 *                 example: "trello"
 *     responses:
 *       '200':
 *         description: App disconnected successfully.
 *       '400':
 *         description: Bad Request - The 'app_name' is missing.
 *       '500':
 *         description: Internal Server Error - Failed to disconnect the app.
 */
/**
 * @description Disconnect an active app integration.
 * @permission Authenticated users.
 * @multitenant Disconnects an app connection associated with the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const disconnectAppController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: Actions must be performed within the user's tenant context.
  const { userId, workspaceId } = req.user;
  const { app_name } = req.body;

  if (!app_name) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'App name is required',
    });
  }

  // HIERARCHY_GAP_FIX: Pass workspaceId to ensure the user is disconnecting an app
  // from their own workspace, preventing cross-tenant interference.
  const result = await composioService.disconnectApp(userId, workspaceId, app_name);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to disconnect app',
      data: { error: process.env.NODE_ENV !== 'production' ? result.error : 'Could not disconnect app.' },
    });
  }
});

/**
 * @openapi
 * /api/v1/composio-simple/capabilities:
 *   get:
 *     summary: Get available actions for an app
 *     description: Retrieves a list of available capabilities (tools/actions) for a given application.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: app
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the app to query for capabilities.
 *         example: "trello"
 *     responses:
 *       '200':
 *         description: A list of capabilities for the specified app.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *       '400':
 *         description: Bad Request - The 'app' query parameter is required.
 */
/**
 * @description Get capabilities (actions) for a specific app.
 * @permission Publicly accessible to authenticated users.
 * @multitenant This is a global, informational endpoint and is not tenant-scoped.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const getAppCapabilitiesController = catchAsync(async (req, res) => {
  const { app } = req.query;

  if (!app) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'App name query parameter is required',
    });
  }

  // SECURITY_FIX: Escape user-provided input for RegExp to prevent Regular Expression Denial of Service (ReDoS).
  const sanitizedApp = escapeRegExp(app);

  // This is a generic informational endpoint and does not require tenant scoping.
  // Recommendation: Add an index on `appName` to the Tool model for efficient querying.
  const capabilities = await Tool.find({
    appName: new RegExp(`^${sanitizedApp}`, 'i')
  }, { name: 1, description: 1, _id: 0 }).lean();

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Capabilities retrieved',
    data: capabilities
  });
});

/**
 * @openapi
 * /api/v1/composio-simple/connection-status-stream:
 *   get:
 *     summary: Stream app connection status
 *     description: >
 *       Provides a Server-Sent Events (SSE) stream to monitor the status of connected applications for the user's workspace.
 *       The stream pushes updates periodically.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: An active SSE stream.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 data: {"type":"connected_apps","data":[{"appName":"trello","status":"active"}]}
 *
 *       '401':
 *         description: Unauthorized - User authentication context is missing.
 */
/**
 * @description SSE endpoint for streaming connection status.
 * @permission Authenticated users.
 * @multitenant The stream reports the connection status for all apps within the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const connectionStatusStreamController = catchAsync(async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // SECURITY_FIX: Use safe destructuring and explicitly check for required context.
  const { userId, workspaceId } = req.user || {};
  if (!userId || !workspaceId) {
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'Unauthorized' } })}\n\n`);
    return res.end();
  }

  const sendStatus = async () => {
    try {
      // HIERARCHY_GAP_FIX: Fetch accounts for the entire workspace, not just the user.
      // This allows any member of the workspace to see the connection status.
      const accounts = await composioService.getConnectedAccountsService(workspaceId);
      res.write(`data: ${JSON.stringify({ type: 'connected_apps', data: accounts.data || [] })}\n\n`);
    } catch (err) {
      logger.error(`SSE push error for user ${userId}:`, err);
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'Failed to fetch status' } })}\n\n`);
    }
  };

  await sendStatus();

  const intervalId = setInterval(sendStatus, 3000);

  req.on('close', () => {
    clearInterval(intervalId);
    res.end();
  });
});

/**
 * @openapi
 * /api/v1/composio-simple/wait-for-connection:
 *   post:
 *     summary: Wait for an app connection to complete
 *     description: A long-polling or wait endpoint to confirm that an app connection initiated via OAuth has been successfully established.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
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
 *                 description: The ID of the connection attempt, received from the initiate-auth endpoint.
 *                 example: "cacc_12345"
 *     responses:
 *       '200':
 *         description: Connection successfully established.
 *       '400':
 *         description: Bad Request - The 'connected_account_id' is missing.
 *       '500':
 *         description: Internal Server Error - The connection process failed or timed out.
 */
/**
 * @description Wait for connection completion.
 * @permission Authenticated users.
 * @multitenant Validates that the `connected_account_id` belongs to the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const waitForConnectionController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: Retrieve user context to enforce security checks.
  const { userId, workspaceId } = req.user;
  const { connected_account_id } = req.body;

  if (!connected_account_id) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Connected account ID is required',
    });
  }

  // IDOR_FIX: Pass user and workspace context to the service layer. The service MUST validate
  // that the `connected_account_id` belongs to the user's workspace before proceeding.
  const result = await composioService.waitForConnection(connected_account_id, userId, workspaceId);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Connection established',
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to establish connection',
      data: { error: process.env.NODE_ENV !== 'production' ? result.error : 'Connection failed.' },
    });
  }
});

/**
 * @openapi
 * /api/v1/composio-simple/conversations:
 *   get:
 *     summary: Get a list of user's conversations
 *     description: Retrieves a paginated list of conversations for the authenticated user within their workspace.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: The number of conversations per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [lastActivity, createdAt]
 *           default: lastActivity
 *         description: The field to sort conversations by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: The sort order.
 *     responses:
 *       '200':
 *         description: A paginated list of conversations.
 *       '401':
 *         description: Unauthorized.
 */
/**
 * @description Get user's conversations.
 * @permission Authenticated users.
 * @multitenant Retrieves conversations scoped to the user's `userId` and `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const getConversationsController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: All data access must be scoped to the user's tenant.
  const { userId, workspaceId } = req.user;

  const page = parseInt(req.query.page, 10);
  const limit = parseInt(req.query.limit, 10);
  const allowedSortBy = ['lastActivity', 'createdAt'];
  const sortBy = allowedSortBy.includes(req.query.sortBy) ? req.query.sortBy : 'lastActivity';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

  const options = {
    page: page > 0 ? page : 1,
    limit: limit > 0 && limit <= 100 ? limit : 20,
    sortBy,
    sortOrder,
  };

  // HIERARCHY_GAP_FIX & IDOR_FIX: Pass workspaceId to the service to ensure conversations
  // are only retrieved from the user's authorized workspace.
  const result = await conversationService.getUserConversations(
    userId,
    workspaceId,
    options
  );

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

/**
 * @openapi
 * /api/v1/composio-simple/conversations/{conversationId}:
 *   get:
 *     summary: Get a specific conversation
 *     description: Retrieves the full message history for a single conversation.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique ID of the conversation.
 *     responses:
 *       '200':
 *         description: The requested conversation object.
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Conversation not found or user does not have access.
 */
/**
 * @description Get specific conversation.
 * @permission Authenticated users.
 * @multitenant Validates that the requested `conversationId` belongs to the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const getConversationController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: All data access must be scoped to the user's tenant.
  const { userId, workspaceId } = req.user;
  const { conversationId } = req.params;

  // IDOR_FIX: The service layer MUST use both userId and workspaceId to validate that the
  // requested conversationId belongs to this user within this specific workspace.
  const conversation = await conversationService.getConversation(
    userId,
    workspaceId,
    conversationId
  );

  if (!conversation) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Conversation not found',
    });
  }

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation retrieved successfully',
    data: conversation,
  });
});

/**
 * @openapi
 * /api/v1/composio-simple/connected-accounts:
 *   get:
 *     summary: Get all connected accounts for the workspace
 *     description: Retrieves a list of all applications that have been successfully connected to the user's workspace.
 *     tags:
 *       - Composio Simple
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: A list of connected accounts.
 *       '401':
 *         description: Unauthorized.
 *       '500':
 *         description: Internal Server Error - Failed to retrieve accounts.
 */
/**
 * @description Get user's connected accounts.
 * @permission Authenticated users.
 * @multitenant Retrieves all connected accounts for the user's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const getConnectedAccountsController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: Connections are a workspace-level resource.
  const { workspaceId } = req.user;

  // HIERARCHY_GAP_FIX: Retrieve accounts associated with the entire workspace.
  const result = await composioService.getWorkspaceConnectedAccounts(workspaceId);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Connected accounts retrieved successfully',
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve connected accounts',
      data: { error: process.env.NODE_ENV !== 'production' ? result.error : 'Could not retrieve accounts.' },
    });
  }
});

/**
 * @openapi
 * /api/v1/composio-simple/compare:
 *   post:
 *     summary: Compare simplified and v2 systems (Admin)
 *     description: >
 *       Runs the same user message through both the simplified and v2 (complex) execution engines
 *       for performance and accuracy comparison. Requires admin privileges.
 *     tags:
 *       - Composio Simple
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user message to use for the comparison.
 *                 example: "What are the top 3 open issues in the 'Alti.Assistant' repo on GitHub?"
 *     responses:
 *       '200':
 *         description: Comparison completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     simplified:
 *                       type: object
 *                     v2:
 *                       type: object
 *                     comparison:
 *                       type: object
 *       '400':
 *         description: Bad Request - The 'message' field is missing.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden - User does not have admin privileges.
 */
/**
 * @description Compare both systems - runs the same request through simplified and v2. Useful for side-by-side testing and performance comparison.
 * @permission Requires 'admin' or 'super_admin' role.
 * @multitenant The comparison is executed within the context of the admin's `workspaceId`.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 */
export const compareController = catchAsync(async (req, res) => {
  // HIERARCHY_GAP_FIX: Add role-based access control (RBAC) for sensitive/debug endpoints.
  const { userId, workspaceId, role } = req.user;
  const { message } = req.body;

  if (role !== 'admin' && role !== 'super_admin') {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'You do not have permission to perform this action.',
    });
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId || !workspaceId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication context is incomplete.',
    });
  }

  const overallStart = Date.now();
  let simplifiedResult = null;
  let simplifiedError = null;
  let simplifiedTime = 0;
  let complexResult = null;
  let complexError = null;
  let complexTime = 0;

  // Run simplified version
  try {
    logger.info(`Comparison: Running simplified system for user ${userId}`);
    const simpleStart = Date.now();
    // HIERARCHY_GAP_FIX: Pass workspaceId to ensure test runs in the correct tenant context.
    simplifiedResult = await composioService.executeUserRequest(
      message,
      userId,
      workspaceId
    );
    simplifiedTime = Date.now() - simpleStart;
    logger.info(`Comparison: Simplified completed in ${simplifiedTime}ms`);
  } catch (error) {
    simplifiedError = error.message;
    simplifiedTime = Date.now() - overallStart;
    logger.error(`Comparison: Simplified failed - ${error.message}`);
  }

  // Run complex version (v2)
  try {
    logger.info(`Comparison: Running v2 system for user ${userId}`);
    const complexStart = Date.now();

    const { executeComposio } = await import(
      '../composio_v2/composio.service.js'
    );
    // HIERARCHY_GAP_FIX: Pass workspaceId to ensure test runs in the correct tenant context.
    complexResult = await executeComposio(message, { userId, workspaceId });
    complexTime = Date.now() - complexStart;
    logger.info(`Comparison: V2 completed in ${complexTime}ms`);
  } catch (error) {
    complexError = error.message;
    complexTime = Date.now() - overallStart;
    logger.error(`Comparison: V2 failed - ${error.message}`);
  }

  const timeSaved = complexTime - simplifiedTime;
  const percentageFaster =
    complexTime > 0
      ? Math.round(((complexTime - simplifiedTime) / complexTime) * 100)
      : 0;

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Comparison completed',
    data: {
      testMessage: message,
      simplified: {
        success: simplifiedResult?.success || false,
        response: simplifiedResult?.data?.response || null,
        toolsUsed: simplifiedResult?.data?.toolsUsed || [],
        executionTime: `${simplifiedTime}ms`,
        error: process.env.NODE_ENV !== 'production' && simplifiedError ? 'An error occurred' : simplifiedError,
        conversationId: simplifiedResult?.data?.conversationId || null,
      },
      v2: {
        success: complexResult?.success || false,
        response: complexResult?.data?.result || complexResult?.result || null,
        executionTime: `${complexTime}ms`,
        error: process.env.NODE_ENV !== 'production' && complexError ? 'An error occurred' : complexError,
      },
      comparison: {
        timeSaved: `${timeSaved}ms`,
        percentageFaster: `${percentageFaster}%`,
        simplifiedWon: simplifiedTime < complexTime,
        improvement:
          timeSaved > 0
            ? `Simplified is ${timeSaved}ms (${percentageFaster}%) faster`
            : `V2 is ${Math.abs(timeSaved)}ms faster`,
      },
    },
  });
});

/**
 * A collection of controller functions for the Composio Simple module,
 * handling chat, authentication, and conversation management.
 * @namespace composioSimpleController
 */
export const composioSimpleController = {
  chatController,
  initiateAuthController,
  waitForConnectionController,
  getConversationsController,
  getConversationController,
  getConnectedAccountsController,
  compareController,
  disconnectAppController,
  getAppCapabilitiesController,
  connectionStatusStreamController,
};