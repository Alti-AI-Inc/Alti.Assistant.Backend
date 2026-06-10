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
import SubscriptionModel from '../subscription/subscription.model.js';

/**
 * Main chat endpoint - handles user messages and executes actions
 */
export const chatController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { message, conversationId, scopedApp } = req.body;

  // Validate input
  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  // Check subscription limits (optional - can be removed if not needed)
  // Optimization: Added .lean() for read-only query to return a plain JavaScript object.
  // Recommendation: Consider adding an index on `userId` and a compound index on `{ userId: 1, createdAt: -1 }`
  // to the SubscriptionModel for efficient querying and sorting.
  const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
    createdAt: -1,
  }).lean();
  if (userSubscription && userSubscription.usage <= 0) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'You have reached your usage limit. Please upgrade your plan.',
    });
  }

  try {
    // Get or create conversation
    const activeConversationId = conversationId || generateConversationId();
    // Recommendation: Ensure `conversationService.getOrCreateConversation` uses .lean() if the returned conversation
    // object is not modified, and that `userId` and `conversationId` are indexed on the Conversation model.
    // Security Note: The `conversationService.getOrCreateConversation` function MUST validate that `activeConversationId`
    // (if provided) belongs to the `userId` to prevent Insecure Direct Object Reference (IDOR).
    const conversation = await conversationService.getOrCreateConversation(
      userId,
      activeConversationId,
      message
    );

    // Save user message
    // Recommendation: Ensure `conversationService.saveMessage` performs efficient writes.
    // If it queries before saving, ensure relevant fields are indexed.
    // Security Note: The `conversationService.saveMessage` function MUST validate that `conversation.conversationId`
    // belongs to the `userId` to prevent Insecure Direct Object Reference (IDOR).
    await conversationService.saveMessage(
      conversation.conversationId,
      userId,
      'user',
      message
    );

    // Execute the request
    const result = await composioService.executeUserRequest(
      message,
      userId,
      conversation.conversationId,
      scopedApp
    );


    if (result.success) {
      // Save assistant response
      // Recommendation: Ensure `conversationService.saveMessage` performs efficient writes.
      // If it queries before saving, ensure relevant fields are indexed.
      // Security Note: The `conversationService.saveMessage` function MUST validate that `conversation.conversationId`
      // belongs to the `userId` to prevent Insecure Direct Object Reference (IDOR).
      await conversationService.saveMessage(
        conversation.conversationId,
        userId,
        'assistant',
        result.data.response,
        {
          toolsUsed: result.data.toolsUsed || [],
          executionTime: result.data.executionTime,
        }
      );

      logger.info(`Composio Simple: Successful execution for user ${userId}`);

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
      // Save error message
      // Recommendation: Ensure `conversationService.saveMessage` performs efficient writes.
      // If it queries before saving, ensure relevant fields are indexed.
      // Security Note: The `conversationService.saveMessage` function MUST validate that `conversation.conversationId`
      // belongs to the `userId` to prevent Insecure Direct Object Reference (IDOR).
      await conversationService.saveMessage(
        conversation.conversationId,
        userId,
        'assistant',
        `Error: ${result.error}`,
        { error: true }
      );

      logger.error(
        `Composio Simple: Failed execution for user ${userId}: ${result.error}`
      );

      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to process request',
        data: result.data,
      });
    }
  } catch (error) {
    logger.error(`Composio Simple: Error in chat controller: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An unexpected error occurred',
      data: {
        error: error.message,
      },
    });
  }
});

/**
 * Initiate app authentication
 */
export const initiateAuthController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { app_name } = req.body;

  if (!app_name) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'App name is required',
    });
  }

  const result = await composioService.initiateAuth(app_name, userId);

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
      result.error.includes('AuthenticationError') ||
      result.error.includes('API key') ||
      result.error.includes('auth') ||
      result.error.includes('key')
    );

    const statusCode = isApiKeyError ? httpStatus.BAD_REQUEST : httpStatus.INTERNAL_SERVER_ERROR;
    const message = isApiKeyError
      ? "Failed to connect to Composio. Please verify that your COMPOSIO_API_KEY or COMPOSIO_ORG_API_KEY is valid and configured in the backend's .env file."
      : 'Failed to initiate authentication';

    return sendResponse(res, {
      statusCode,
      success: false,
      message,
      data: { error: result.error },
    });
  }
});

/**
 * Disconnect an active app integration
 */
export const disconnectAppController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { app_name } = req.body;

  if (!app_name) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'App name is required',
    });
  }

  const result = await composioService.disconnectApp(userId, app_name);

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
      message: result.error || 'Failed to disconnect app',
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

  // Find all tools associated with this appName
  // We use regex to handle case insensitivity
  // Optimization: Already uses .lean() for read-only data.
  // Recommendation: Add an index on `appName` to the Tool model for efficient querying, especially with regex.
  const capabilities = await Tool.find({
    appName: new RegExp(`^${app}`, 'i')
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
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Handle both auth middleware user and default fallback
  // Security Fix: Removed 'default_user' fallback. If userId is not present,
  // it indicates an unauthenticated request to an endpoint that requires authentication.
  const userId = req.user?._id?.toString();
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required for SSE stream',
    });
  }

  // Helper to fetch and send
  const sendStatus = async () => {
    try {
      // Recommendation: If `composioService.getConnectedAccountsService` queries a Mongoose model,
      // ensure it uses .lean() for read-only data and that `userId` is indexed on the relevant model.
      const accounts = await composioService.getConnectedAccountsService(userId);
      // Write SSE format: data: {...}\n\n
      res.write(`data: ${JSON.stringify({ type: 'connected_apps', data: accounts.data || [] })}\n\n`);
    } catch (err) {
      logger.error('SSE push error:', err);
    }
  };

  // Send immediately on connect
  await sendStatus();

  // Poll composio backend every 3 seconds and stream to client
  // (Moves the polling burden from the client to the server)
  const intervalId = setInterval(sendStatus, 3000);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(intervalId);
    res.end();
  });
});

/**
 * Wait for connection completion
 */
export const waitForConnectionController = catchAsync(async (req, res) => {
  const { connected_account_id } = req.body;

  if (!connected_account_id) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Connected account ID is required',
    });
  }

  // Security Note: The `composioService.waitForConnection` function MUST validate that `connected_account_id`
  // belongs to the authenticated `userId` (available via `req.user`) to prevent Insecure Direct Object Reference (IDOR).
  const result = await composioService.waitForConnection(connected_account_id);

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
      data: { error: result.error },
    });
  }
});

/**
 * Get user's conversations
 */
export const getConversationsController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'lastActivity',
    sortOrder: parseInt(req.query.sortOrder) || -1,
  };

  // Recommendation: Ensure `conversationService.getUserConversations` uses .lean() for read-only data.
  // Also, ensure that `userId` is indexed on the Conversation model, and if `lastActivity` is a field
  // used for sorting, a compound index like `{ userId: 1, lastActivity: -1 }` would be highly beneficial.
  const result = await conversationService.getUserConversations(
    userId,
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
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  // Recommendation: Ensure `conversationService.getOrCreateConversation` uses .lean() if the returned conversation
  // object is not modified, and that `userId` and `conversationId` are indexed on the Conversation model.
  // Security Note: The `conversationService.getOrCreateConversation` function MUST validate that `conversationId`
  // belongs to the `userId` to prevent Insecure Direct Object Reference (IDOR).
  const conversation = await conversationService.getOrCreateConversation(
    userId,
    conversationId,
    ''
  );

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
  const userId = req.user?.userId || req.user?._id;

  // Recommendation: If `composioService.getUserConnectedAccounts` queries a Mongoose model,
  // ensure it uses .lean() for read-only data and that `userId` is indexed on the relevant model.
  const result = await composioService.getUserConnectedAccounts(userId);

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
      data: { error: result.error },
    });
  }
});

/**
 * Compare both systems - runs the same request through simplified and v2
 * Useful for side-by-side testing and performance comparison
 */
export const compareController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { message } = req.body;

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
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
    // Recommendation: If `composioService.executeUserRequest` queries Mongoose models,
    // ensure it uses .lean() for read-only data and relevant fields are indexed.
    simplifiedResult = await composioService.executeUserRequest(
      message,
      userId
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

    // Import v2 service dynamically
    const { executeComposio } = await import(
      '../composio_v2/composio.service.js'
    );
    // Recommendation: If `executeComposio` queries Mongoose models,
    // ensure it uses .lean() for read-only data and relevant fields are indexed.
    complexResult = await executeComposio(message, { userId });
    complexTime = Date.now() - complexStart;
    logger.info(`Comparison: V2 completed in ${complexTime}ms`);
  } catch (error) {
    complexError = error.message;
    complexTime = Date.now() - overallStart;
    logger.error(`Comparison: V2 failed - ${error.message}`);
  }

  // Calculate improvements
  const timeSaved = complexTime - simplifiedTime;
  const percentageFaster =
    complexTime > 0
      ? Math.round(((complexTime - simplifiedTime) / complexTime) * 100)
      : 0;

  // Return comparison
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
        error: simplifiedError,
        conversationId: simplifiedResult?.data?.conversationId || null,
      },
      v2: {
        success: complexResult?.success || false,
        response: complexResult?.data?.result || complexResult?.result || null,
        executionTime: `${complexTime}ms`,
        error: complexError,
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