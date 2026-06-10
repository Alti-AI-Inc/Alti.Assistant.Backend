import { aiClassificationService } from './aiClassification.service.js';

import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse.js';
import catchAsync from '../../../shared/catchAsync.js';

/**
 * @swagger
 * /api/v1/ai-classification/classify-and-execute:
 *   post:
 *     summary: Classify user input and execute relevant AI tools or actions.
 *     description: This endpoint processes a user's natural language message, classifies their intent, and attempts to execute the most relevant AI-powered tool or action. It handles both authenticated and guest users, managing user IDs accordingly to prevent security vulnerabilities.
 *     tags:
 *       - AI Classification
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
 *                 description: The user's natural language input message.
 *                 example: "Find me a flight from New York to London next month."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional ID of the ongoing conversation. Used to maintain context.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               userId:
 *                 type: string
 *                 description: Optional user ID for guest users. For authenticated users, this is derived from the session.
 *                 example: "guest_12345"
 *     responses:
 *       200:
 *         description: Request processed successfully, and AI classification/execution result is returned.
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
 *                   example: "Request processed successfully"
 *                 data:
 *                   type: object
 *                   description: The result of the AI classification and execution.
 *                   properties:
 *                     responseMessage:
 *                       type: object
 *                       properties:
 *                         text:
 *                           type: string
 *                           example: "I found several flights. Which dates are you interested in?"
 *                         type:
 *                           type: string
 *                           example: "text"
 *                     conversationId:
 *                       type: string
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                     messageCount:
 *                       type: number
 *                       example: 2
 *                     userType:
 *                       type: string
 *                       example: "authenticated"
 *                     toolExecuted:
 *                       type: string
 *                       example: "flight_search"
 *       400:
 *         description: Bad Request - User input (message) is missing.
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
 *                   example: "User input is required"
 *       500:
 *         description: Internal Server Error - An unexpected error occurred during processing.
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
 *                   example: "Internal server error while processing request"
 *                 data:
 *                   type: object
 *                   properties:
 *                     responseMessage:
 *                       type: object
 *                       properties:
 *                         text:
 *                           type: string
 *                           example: "Sorry, I encountered an unexpected error: Something went wrong."
 *                         type:
 *                           type: string
 *                           example: "error"
 *                     conversationId:
 *                       type: string
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                     messageCount:
 *                       type: number
 *                       example: 1
 *                     userType:
 *                       type: string
 *                       example: "authenticated"
 *                     userId:
 *                       type: string
 *                       example: "user_123"
 */
/**
 * Controller for AI-powered user input classification and tool execution.
 *
 * This function handles incoming user messages, determines if the user is a guest or authenticated,
 * extracts the appropriate user ID, and then delegates the message processing to the
 * `aiClassificationService`. It returns the result of the AI's classification and any
 * subsequent tool execution.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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
 * @swagger
 * /api/v1/ai-classification/supported-apps:
 *   get:
 *     summary: Retrieve a list of all supported AI applications and their available actions.
 *     description: This endpoint dynamically fetches and groups all integrated applications and their corresponding actions (tools) from the database. It provides a comprehensive map of what the AI assistant can currently do.
 *     tags:
 *       - AI Classification
 *     responses:
 *       200:
 *         description: Successfully retrieved the list of supported applications and actions.
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
 *                   example: "5 supported apps and actions retrieved successfully"
 *                 data:
 *                   type: object
 *                   description: An object where keys are app names (lowercase) and values are app details.
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: The display name of the application.
 *                         example: "Google Calendar"
 *                       description:
 *                         type: string
 *                         description: A brief description of the application's capabilities.
 *                         example: "Integration with Google Calendar for scheduling and event management."
 *                       actions:
 *                         type: array
 *                         items:
 *                           type: string
 *                           description: A slug representing an available action for this application.
 *                           example: "google_calendar_create_event"
 *       500:
 *         description: Internal Server Error - Failed to load supported apps from the database.
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
 *                   example: "Failed to load supported apps"
 *                 data:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "Database connection error"
 */
/**
 * Controller to get supported apps and actions (dynamically loaded from DB).
 *
 * This function retrieves all available tools from the database, groups them by application,
 * and returns a structured list of supported applications along with their respective actions.
 * It includes optimizations for performance and handles potential errors during database access.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const getSupportedAppsController = catchAsync(async (req, res) => {
  try {
    // Dynamically load all available apps and their actions from the Tool model
    const Tool = (await import('./tools.model.js')).default;
    
    // Optimization: The .lean() method is already used, which is good for performance
    // by returning plain JavaScript objects instead of Mongoose documents.
    // Indexing Recommendation: For better performance on large collections, consider adding
    // indexes to 'appName' and 'slug' fields in the Tool model, especially if these fields
    // are frequently used in queries or sorting operations.
    const tools = await Tool.find({}, { slug: 1, name: 1, description: 1, appName: 1 }).lean();
    
    // Group tools by appName to build a comprehensive app->actions map
    const supportedApps = {};
    for (const tool of tools) {
      const appKey = (tool.appName || tool.slug?.split('_')[0] || 'unknown').toLowerCase();
      
      if (!supportedApps[appKey]) {
        supportedApps[appKey] = {
          name: tool.appName || appKey,
          description: tool.description || `Integration with ${appKey}`,
          // Optimization: Use a Set for 'actions' to improve the efficiency of uniqueness checks
          // from O(N) (with Array.includes) to O(1) average case.
          actions: new Set(), 
        };
      }
      
      if (tool.slug) { // Only add if slug exists
        supportedApps[appKey].actions.add(tool.slug);
      }
    }

    // Convert Sets back to Arrays for the final response data
    for (const appKey in supportedApps) {
      supportedApps[appKey].actions = Array.from(supportedApps[appKey].actions);
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
 * @swagger
 * /api/v1/ai-classification/test-classification:
 *   post:
 *     summary: Test the AI's classification capability without executing any actions.
 *     description: This endpoint allows developers to test how the AI classifies a given user input message into potential intents or tools, without actually triggering any external tool execution. It's useful for debugging and understanding the AI's interpretation.
 *     tags:
 *       - AI Classification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userInput
 *             properties:
 *               userInput:
 *                 type: string
 *                 description: The user's natural language input message to be classified.
 *                 example: "Schedule a meeting for tomorrow at 3 PM with John."
 *     responses:
 *       200:
 *         description: Classification completed successfully, returning the AI's classification result.
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
 *                   example: "Classification completed successfully"
 *                 data:
 *                   type: object
 *                   description: The classification result, typically including identified intent, tools, and extracted parameters.
 *                   properties:
 *                     intent:
 *                       type: string
 *                       example: "schedule_meeting"
 *                     toolCalls:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           toolName:
 *                             type: string
 *                             example: "google_calendar_create_event"
 *                           args:
 *                             type: object
 *                             properties:
 *                               summary:
 *                                 type: string
 *                                 example: "Meeting with John"
 *                               startTime:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2024-08-15T15:00:00Z"
 *       400:
 *         description: Bad Request - User input is missing.
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
 *                   example: "User input is required"
 *       500:
 *         description: Internal Server Error - Failed to classify user input.
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
 *                   example: "Failed to classify user input"
 *                 data:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "AI model unavailable"
 */
/**
 * Controller to test classification without execution.
 *
 * This function takes a `userInput` message and sends it to the AI classification service
 * to get the predicted intent and tool calls, without actually performing any actions.
 * It's useful for debugging and understanding the AI's classification logic.
 *
 * @param {import('express').Request} req - The Express request object, containing `userInput` in the body.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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
 * @swagger
 * /api/v1/ai-classification/user-connections:
 *   get:
 *     summary: Retrieve the connected accounts (integrations) for a specific user.
 *     description: This endpoint fetches a list of all external applications and services that a user has connected to the AI assistant. It helps determine which tools the AI can leverage on behalf of the user.
 *     tags:
 *       - AI Classification
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: The ID of the user whose connections are to be retrieved. Required for guest users if not authenticated. For authenticated users, it's derived from the session.
 *         example: "user_12345"
 *     responses:
 *       200:
 *         description: User connections retrieved successfully.
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
 *                   example: "User connections retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "6543210fedcba9876543210f"
 *                       userId:
 *                         type: string
 *                         example: "user_12345"
 *                       provider:
 *                         type: string
 *                         example: "google"
 *                       status:
 *                         type: string
 *                         example: "ACTIVE"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Bad Request - User ID is missing.
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
 *         description: Internal Server Error - An error occurred while retrieving user connections.
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
 *                   example: "Internal server error while retrieving connections"
 *                 data:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "Database query failed"
 */
/**
 * Controller to check user connections for apps.
 *
 * This function retrieves all connected accounts (integrations) for a given user.
 * It determines the user ID based on authentication status (authenticated or guest)
 * and then calls the `aiClassificationService` to fetch the connections.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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
 * @swagger
 * /api/v1/ai-classification/conversation-history:
 *   get:
 *     summary: Retrieve conversation history or statistics for a user.
 *     description: This endpoint fetches either the full conversation history for a specific conversation ID or general conversation statistics (e.g., a list of conversation IDs) for a given user. It supports both authenticated and guest users.
 *     tags:
 *       - AI Classification
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: The ID of the user whose conversation history is to be retrieved. Required for guest users if not authenticated. For authenticated users, it's derived from the session.
 *         example: "user_12345"
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional. If provided, fetches the detailed history for this specific conversation. If omitted, fetches a list of conversation IDs or summary statistics.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: Optional. The maximum number of conversation messages or conversation IDs to return. Defaults to 20.
 *         example: 10
 *     responses:
 *       200:
 *         description: Conversation history or statistics retrieved successfully.
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
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   oneOf:
 *                     - type: array
 *                       description: Array of conversation messages if `conversationId` is provided.
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "6543210fedcba9876543210f"
 *                           conversationId:
 *                             type: string
 *                             example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                           userId:
 *                             type: string
 *                             example: "user_12345"
 *                           role:
 *                             type: string
 *                             enum: [user, assistant]
 *                             example: "user"
 *                           content:
 *                             type: string
 *                             example: "Hello, how are you?"
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                     - type: object
 *                       description: Object containing conversation statistics or a list of conversation IDs if `conversationId` is not provided.
 *                       properties:
 *                         conversations:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               conversationId:
 *                                 type: string
 *                                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                               lastMessage:
 *                                 type: string
 *                                 example: "What's the weather like?"
 *                               lastUpdated:
 *                                 type: string
 *                                 format: date-time
 *       400:
 *         description: Bad Request - User ID is missing.
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
 *         description: Internal Server Error - An error occurred while retrieving conversation data.
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
 *                   example: "Internal server error while retrieving conversation data"
 *                 data:
 *                   type: object
 *                   properties:
 *                     error:
 *                       type: string
 *                       example: "Database query failed"
 */
/**
 * Controller to get conversation history and stats.
 *
 * This function retrieves either a specific conversation's message history or a summary
 * of all conversations for a given user. It handles user ID determination for both
 * authenticated and guest users and delegates the data retrieval to the `aiClassificationService`.
 *
 * @param {import('express').Request} req - The Express request object, potentially containing `userId`, `conversationId`, and `limit` in query parameters.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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

/**
 * @namespace aiClassificationController
 * @description Provides a collection of controller functions for AI classification, tool execution,
 *              app management, and conversation history retrieval within the Composio v2 module.
 *              These controllers handle API requests related to the AI assistant's core functionalities.
 */
export const aiClassificationController = {
  classifyAndExecuteController,
  getSupportedAppsController,
  testClassificationController,
  getUserConnectionsController,
  getConversationHistoryController,
};