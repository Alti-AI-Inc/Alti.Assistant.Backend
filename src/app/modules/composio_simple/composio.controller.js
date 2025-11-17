import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { composioService } from './composio.service.js';
import { conversationService, generateConversationId } from './composio.conversation.js';
import SubscriptionModel from '../payment/payment.model.js';

/**
 * Main chat endpoint - handles user messages and executes actions
 */
export const chatController = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;

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
  const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
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
    const conversation = await conversationService.getOrCreateConversation(
      userId,
      activeConversationId,
      message
    );

    // Save user message
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
      conversation.conversationId
    );

    if (result.success) {
      // Save assistant response
      await conversationService.saveMessage(
        conversation.conversationId,
        userId,
        'assistant',
        result.data.response,
        {
          toolsUsed: result.data.toolsUsed || [],
          executionTime: result.data.executionTime
        }
      );

      logger.info(`Composio Simple: Successful execution for user ${userId}`);

      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          ...result.data,
          conversationId: conversation.conversationId
        },
      });
    } else {
      // Save error message
      await conversationService.saveMessage(
        conversation.conversationId,
        userId,
        'assistant',
        `Error: ${result.error}`,
        { error: true }
      );

      logger.error(`Composio Simple: Failed execution for user ${userId}: ${result.error}`);

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
        error: error.message
      }
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
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to initiate authentication',
      data: { error: result.error }
    });
  }
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
      data: { error: result.error }
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

  const result = await conversationService.getUserConversations(userId, options);

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
      data: { error: result.error }
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
    simplifiedResult = await composioService.executeUserRequest(message, userId);
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
    const { executeComposio } = await import('../composio_v2/composio.service.js');
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
  const percentageFaster = complexTime > 0
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
        conversationId: simplifiedResult?.data?.conversationId || null
      },
      v2: {
        success: complexResult?.success || false,
        response: complexResult?.data?.result || complexResult?.result || null,
        executionTime: `${complexTime}ms`,
        error: complexError
      },
      comparison: {
        timeSaved: `${timeSaved}ms`,
        percentageFaster: `${percentageFaster}%`,
        simplifiedWon: simplifiedTime < complexTime,
        improvement: timeSaved > 0
          ? `Simplified is ${timeSaved}ms (${percentageFaster}%) faster`
          : `V2 is ${Math.abs(timeSaved)}ms faster`
      }
    }
  });
});

export const composioSimpleController = {
  chatController,
  initiateAuthController,
  waitForConnectionController,
  getConversationsController,
  getConversationController,
  getConnectedAccountsController,
  compareController
};
