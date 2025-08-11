import { aiClassificationService } from "./aiClassification.service.js";

import httpStatus from "http-status";
import sendResponse from "../../../shared/sendResponse.js";
import catchAsync from "../../../shared/catchAsync.js";

/**
 * Controller for AI-powered user input classification and tool execution
 */
const classifyAndExecuteController = catchAsync(async (req, res) => {
  const { userInput, userId, conversationId } = req.body;

  if (!userInput) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User input is required',
    });
  }

  try {
    // Get conversation history if conversationId is provided
    const history = []; // This could be retrieved from database if needed
    
    const result = await aiClassificationService.processUserInputService(userInput, {
      userId,
      conversationId,
      history
    });

    if (result.success) {
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: result.data
      });
    } else {
      sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to process request',
        data: result.data
      });
    }
  } catch (error) {
    console.error('Error in classifyAndExecuteController:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Internal server error while processing request',
      data: {
        error: error.message
      }
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
      actions: ['send_email', 'read_email', 'delete_email', 'mark_as_read', 'search_email']
    },
    github: {
      name: 'GitHub',
      description: 'Manage repositories and issues',
      actions: ['create_issue', 'create_pr', 'list_repos', 'create_repo', 'star_repo', 'fork_repo']
    },
    calendar: {
      name: 'Google Calendar',
      description: 'Manage calendar events',
      actions: ['create_event', 'list_events', 'update_event', 'delete_event', 'find_available_time']
    },
    linkedin: {
      name: 'LinkedIn',
      description: 'Professional networking and posting',
      actions: ['post_update', 'send_message', 'connect_user', 'share_article']
    },
    twitter: {
      name: 'Twitter/X',
      description: 'Social media posting and interaction',
      actions: ['post_tweet', 'delete_tweet', 'follow_user', 'send_dm', 'like_tweet']
    },
    youtube: {
      name: 'YouTube',
      description: 'Video platform interaction',
      actions: ['search_videos', 'upload_video', 'like_video', 'subscribe_channel']
    },
    notion: {
      name: 'Notion',
      description: 'Note-taking and database management',
      actions: ['create_page', 'update_page', 'create_database', 'add_to_database']
    },
    amazon: {
      name: 'Amazon',
      description: 'E-commerce and shopping',
      actions: ['search_product', 'add_to_cart', 'place_order', 'track_order']
    },
    slack: {
      name: 'Slack',
      description: 'Team communication',
      actions: ['send_message', 'create_channel', 'invite_user', 'post_announcement']
    },
    discord: {
      name: 'Discord',
      description: 'Community and gaming communication',
      actions: ['send_message', 'create_channel', 'manage_server']
    }
  };

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Supported apps and actions retrieved successfully',
    data: supportedApps
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
    const { classifyUserIntent } = await import("./services/aiClassificationService.js");
    
    const classification = await classifyUserIntent(userInput, []);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Classification completed successfully',
      data: classification
    });
  } catch (error) {
    console.error('Error in testClassificationController:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to classify user input',
      data: {
        error: error.message
      }
    });
  }
});

/**
 * Controller to check user connections for apps
 */
const getUserConnectionsController = catchAsync(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User ID is required',
    });
  }

  try {
    const result = await aiClassificationService.getUserConnectedAccountsService(userId);

    if (result.success) {
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'User connections retrieved successfully',
        data: result.data
      });
    } else {
      sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve user connections',
        data: {
          error: result.error
        }
      });
    }
  } catch (error) {
    console.error('Error in getUserConnectionsController:', error);
    sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Internal server error while retrieving connections',
      data: {
        error: error.message
      }
    });
  }
});

export const aiClassificationController = {
  classifyAndExecuteController,
  getSupportedAppsController,
  testClassificationController,
  getUserConnectionsController
};
