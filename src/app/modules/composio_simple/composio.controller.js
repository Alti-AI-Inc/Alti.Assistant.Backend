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
  // BUG_FIX: The original replacement string '\\{FILE_CONTENT}' was incorrect.
  // '$&' is the correct replacement pattern to insert the entire matched string.
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Main chat endpoint - handles user messages and executes actions
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
 * Initiate app authentication
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
 * Disconnect an active app integration
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
 * Get capabilities (actions) for a specific app
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
 * SSE endpoint for streaming connection status
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
 * Wait for connection completion
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
 * Get user's conversations
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
 * Get specific conversation
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
 * Get user's connected accounts
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
 * Compare both systems - runs the same request through simplified and v2
 * Useful for side-by-side testing and performance comparison
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