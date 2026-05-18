import { aiClassificationService } from './aiClassification.service.js';

import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';

/**
 * Controller for AI-powered user input classification and tool execution
 */
const classifyAndExecuteController = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? null : req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;
  userId = req.body?.userId || userId; // Allow overriding userId from request body

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User input is required',
    });
  }

  try {
    // For authenticated users, check if they have any connected accounts

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
 * Controller to get supported apps and actions
 */
const getSupportedAppsController = catchAsync(async (req, res) => {
  const supportedApps = {
    gmail: {
      name: 'Gmail',
      description: 'Send and manage emails',
      actions: [
        'send_email',
        'read_email',
        'delete_email',
        'mark_as_read',
        'search_email',
      ],
    },
    github: {
      name: 'GitHub',
      description: 'Manage repositories and issues',
      actions: [
        'create_issue',
        'create_pr',
        'list_repos',
        'create_repo',
        'star_repo',
        'fork_repo',
      ],
    },
    calendar: {
      name: 'Google Calendar',
      description: 'Manage calendar events',
      actions: [
        'create_event',
        'list_events',
        'update_event',
        'delete_event',
        'find_available_time',
      ],
    },
    linkedin: {
      name: 'LinkedIn',
      description: 'Professional networking and posting',
      actions: ['post_update', 'send_message', 'connect_user', 'share_article'],
    },
    twitter: {
      name: 'Twitter/X',
      description: 'Social media posting and interaction',
      actions: [
        'post_tweet',
        'delete_tweet',
        'follow_user',
        'send_dm',
        'like_tweet',
      ],
    },
    youtube: {
      name: 'YouTube',
      description: 'Video platform interaction',
      actions: [
        'search_videos',
        'upload_video',
        'like_video',
        'subscribe_channel',
      ],
    },
    notion: {
      name: 'Notion',
      description: 'Note-taking and database management',
      actions: [
        'create_page',
        'update_page',
        'create_database',
        'add_to_database',
      ],
    },
    amazon: {
      name: 'Amazon',
      description: 'E-commerce and shopping',
      actions: ['search_product', 'add_to_cart', 'place_order', 'track_order'],
    },
    slack: {
      name: 'Slack',
      description: 'Team communication',
      actions: [
        'send_message',
        'create_channel',
        'invite_user',
        'post_announcement',
      ],
    },
    discord: {
      name: 'Discord',
      description: 'Community and gaming communication',
      actions: ['send_message', 'create_channel', 'manage_server'],
    },
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Supported apps and actions retrieved successfully',
    data: supportedApps,
  });
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
  let userId = isGuest ? null : req.user?.userId || req.user?._id;
  const { conversationId, limit } = req.query;
  userId = req.query?.userId || userId;

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
