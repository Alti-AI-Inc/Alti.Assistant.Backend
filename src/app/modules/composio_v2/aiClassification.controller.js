import { aiClassificationService } from './aiClassification.service.js';

import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';

/**
 * Controller for AI-powered user input classification and tool execution
 */
const classifyAndExecuteController = catchAsync(async (req, res) => {
  // Determine if the user is a guest. `req.isGuest` would typically be set by a middleware.
  const isGuest = req.isGuest || !req.user;
  let userId;

  // For authenticated users, userId must come from the authenticated session (req.user).
  // For guest users, userId can be null or potentially provided in the request body for anonymous tracking.
  // This prevents IDOR (Insecure Direct Object Reference) where an authenticated user could
  // override their userId with one from the request body to impersonate another user.
  if (!isGuest) {
    userId = req.user?.userId || req.user?._id;
  } else {
    userId = req.body?.userId || null; // Guest can provide userId in body, otherwise null
  }

  const { message, conversationId } = req.body;

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User input is required',
    });
  }

  try {
    const result = await aiClassificationService.processUserInputService(
      message,
      {
        userId,
        conversationId,
        isGuest,
      },
      req
    );

    console.log('AI classification result:', result);

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message || 'Request processed successfully',
        data: result.data,
      });
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: result.message || 'Failed to process request',
        data: result.data,
      });
    }
  } catch (error) {
    console.error('Error in classifyAndExecuteController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Internal server error while processing request',
      data: {
        responseMessage: {
          text: `Sorry, I encountered an unexpected error: ${error.message}`,
          type: 'error',
        },
        conversationId: conversationId || null,
        messageCount: 1,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Controller to get supported apps and actions (dynamically loaded from DB)
 */
const getSupportedAppsController = catchAsync(async (req, res) => {
  try {
    // Dynamically load all available apps and their actions from the Tool model
    const Tool = (await import('./tools.model.js')).default;
    
    const tools = await Tool.find({}, { slug: 1, name: 1, description: 1, appName: 1 }).lean();
    
    // Group tools by appName to build a comprehensive app->actions map
    const supportedApps = {};
    for (const tool of tools) {
      const appKey = (tool.appName || tool.slug?.split('_')[0] || 'unknown').toLowerCase();
      
      if (!supportedApps[appKey]) {
        supportedApps[appKey] = {
          name: tool.appName || appKey,
          description: tool.description || `Integration with ${appKey}`,
          actions: [],
        };
      }
      
      if (tool.slug && !supportedApps[appKey].actions.includes(tool.slug)) {
        supportedApps[appKey].actions.push(tool.slug);
      }
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `${Object.keys(supportedApps).length} supported apps and actions retrieved successfully`,
      data: supportedApps,
    });
  } catch (error) {
    console.error('Error loading supported apps from DB:', error.message);
    // Bug Fix: Changed status code from OK to INTERNAL_SERVER_ERROR and success to false
    // to accurately reflect that an error occurred during loading.
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to load supported apps',
      data: {
        error: error.message,
      },
    });
  }
});

/**
 * Controller to test classification without execution
 */
const testClassificationController = catchAsync(async (req, res) => {
  const { userInput } = req.body;

  if (!userInput) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User input is required',
    });
  }

  try {
    const { classifyUserIntent } = await import(
      './services/aiClassificationService.js'
    );

    const classification = await classifyUserIntent(userInput, []);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Classification completed successfully',
      data: classification,
    });
  } catch (error) {
    console.error('Error in testClassificationController:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to classify user input',
      data: {
        error: error.message,
      },
    });
  }
});

/**
 * Controller to check user connections for apps
 */
const getUserConnectionsController = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? null : req.user?.userId || req.user?._id;
  console.log(`User ID for connections: ${userId}`);

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User ID is required',
    });
  }

  try {
    const result =
      await aiClassificationService.getUserConnectedAccountsService(
        userId,
        null, // status — defaults to 'ACTIVE' inside the service
        req
      );
    console.log(`User connections for ${userId}:`, result);

    if (result.success) {
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'User connections retrieved successfully',
        data: result.data,
      });
    } else {
      sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve user connections',
        data: {
          error: result.error,
        },
      });
    }
  } catch (error) {
    console.error('Error in getUserConnectionsController:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Internal server error while retrieving connections',
      data: {
        error: error.message,
      },
    });
  }
});

/**
 * Controller to get conversation history and stats
 */
const getConversationHistoryController = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId;

  // For authenticated users, userId must come from the authenticated session (req.user).
  // For guest users, userId can be null or potentially provided in the query for anonymous tracking.
  // This prevents IDOR (Insecure Direct Object Reference) where an authenticated user could
  // override their userId with one from the query parameters to view another user's history.
  if (!isGuest) {
    userId = req.user?.userId || req.user?._id;
  } else {
    userId = req.query?.userId || null; // Guest can provide userId in query, otherwise null
  }

  const { conversationId, limit } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User ID is required',
    });
  }

  try {
    const result =
      await aiClassificationService.getComposioConversationHistoryService(
        userId,
        {
          conversationId,
          limit: limit ? parseInt(limit) : 20,
        },
        req
      );

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: conversationId
          ? 'Conversation history retrieved successfully'
          : 'Conversation stats retrieved successfully',
        data: result.data,
      });
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve conversation data',
        data: {
          error: result.error,
        },
      });
    }
  } catch (error) {
    console.error('Error in getConversationHistoryController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Internal server error while retrieving conversation data',
      data: {
        error: error.message,
      },
    });
  }
});

export const aiClassificationController = {
  classifyAndExecuteController,
  getSupportedAppsController,
  testClassificationController,
  getUserConnectionsController,
  getConversationHistoryController,
};