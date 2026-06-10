import httpStatus from 'http-status';
import { PubSub } from '@google-cloud/pubsub'; // GCP Pub/Sub import for asynchronous offloading
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { codeService } from './code.service.js';
// The AI workflow is no longer invoked directly in the controller.
// It will be handled by a separate background worker.
// import { codeAssistantApp } from './code_assistant/workflow.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { codeHelpers } from './code.helper.js';

// Initialize the Google Cloud Pub/Sub client.
// This should be a singleton instance in a real application.
const pubSubClient = new PubSub();

// Define the Pub/Sub topic name. It's best practice to use an environment variable.
const codeAssistantTopicName =
  process.env.CODE_ASSISTANT_TOPIC || 'code-assistant-requests';

/**
 * @swagger
 * /api/v1/code/perform-task:
 *   post:
 *     summary: Initiate a code generation or assistance task.
 *     description: |
 *       Handles requests for code generation or assistance from both authenticated and guest users.
 *       For authenticated users, it checks monthly subscription limits before processing the request.
 *       This endpoint accepts the task and queues it for asynchronous processing. The final result should be retrieved via another endpoint or a notification system (e.g., WebSockets).
 *     tags:
 *       - Code
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
 *                 description: The user's query or instruction for the code assistant.
 *                 example: "Generate a simple Express.js route for user login."
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of an existing conversation to continue. If not provided, a new conversation is started.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       202:
 *         description: Task accepted for processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 202
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Your request has been accepted and is being processed."
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the conversation for tracking the task.
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                     userType:
 *                       type: string
 *                       enum: [guest, authenticated]
 *                       description: Indicates if the user was a guest or authenticated.
 *                       example: "authenticated"
 *                     userId:
 *                       type: string
 *                       description: The user ID (only included for guest users for frontend tracking).
 *                       example: "guest_12345"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         description: Forbidden. User has reached their code assistance limit.
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
 *                   example: "You have reached your code assistance limit for this month. Please upgrade your plan to continue."
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller function to handle code generation and assistance tasks.
 * It manages both authenticated and guest user requests, checks subscription limits for authenticated users,
 * and queues the task for a background worker via GCP Pub/Sub.
 * @function performCodeTask
 * @async
 * @param {import('express').Request} req - The Express request object. It contains the user's message, optional conversationId, and user authentication details.
 * @param {import('express').Response} res - The Express response object used to send back the AI's response or an error.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
export const performCodeTask = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? codeService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;

  // Skip subscription check for guest users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean();

    const monthlyLimit = userSubscription
      ? userSubscription.usage
      : codeService.getDefaultFreeTierLimit();

    const currentMonthlyUsage = await codeService.getMonthlyMessageCount(userId);

    if (currentMonthlyUsage >= monthlyLimit) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your code assistance limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A code query is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id = conversationId || codeService.generateCodeConversationId();
  let actualConversationId;

  try {
    // Perform initial synchronous database operations
    const conversation = await codeService.handleCodeConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    actualConversationId = conversation.conversationId || thread_id;

    await codeService.addCodeQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    // REFACTOR: Instead of invoking the AI model in-process, we offload it to a background worker.
    // This makes the API endpoint fast, responsive, and prevents it from tying up server resources
    // or hitting timeout limits for long-running AI tasks.

    // 1. Prepare the payload for the background worker.
    const taskPayload = {
      conversationId: actualConversationId,
      userId,
      message, // The latest user message
      isGuest,
      // Pass any other necessary context for the worker.
      // Avoid passing the full `req` object for security and serialization reasons.
    };

    // 2. Publish a message to the GCP Pub/Sub topic.
    const dataBuffer = Buffer.from(JSON.stringify(taskPayload));
    const messageId = await pubSubClient
      .topic(codeAssistantTopicName)
      .publishMessage({ data: dataBuffer });

    logger.info(
      `Queued code assistant task ${messageId} for conversation: ${actualConversationId}`
    );

    // 3. Respond immediately to the client with HTTP 202 Accepted.
    // The client will need to poll for the result or receive it via a WebSocket/SSE connection.
    return sendResponse(res, {
      statusCode: httpStatus.ACCEPTED,
      success: true,
      message: 'Your request has been accepted and is being processed.',
      data: {
        conversationId: actualConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
      },
    });
  } catch (error) {
    logger.error('Error queuing code assistant task:', error);
    // This catch block now handles errors during the initial DB writes or publishing to Pub/Sub.
    // Errors from the AI model itself will be handled by the background worker.
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while queueing your code request',
      data: {
        conversationId: actualConversationId || thread_id,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

/**
 * @swagger
 * /api/v1/code/stats:
 *   get:
 *     summary: Get code statistics for the authenticated user.
 *     description: |
 *       Retrieves usage statistics related to the code assistant for the currently authenticated user.
 *       This endpoint is not available for guest users.
 *     tags:
 *       - Code
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Code statistics retrieved successfully.
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
 *                   example: "Code statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalConversations:
 *                       type: number
 *                       description: Total number of code conversations initiated by the user.
 *                       example: 15
 *                     totalMessages:
 *                       type: number
 *                       description: Total number of messages exchanged in code conversations.
 *                       example: 60
 *                     lastActivity:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp of the user's last interaction with the code assistant.
 *                       example: "2023-10-27T10:00:00.000Z"
 *       401:
 *         description: Unauthorized. Statistics are only available for authenticated users or user authentication is required.
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
 *                   example: "Statistics are only available for authenticated users"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller function to retrieve code assistant usage statistics for an authenticated user.
 * Rejects requests from guest users.
 * @function getCodeStats
 * @async
 * @param {import('express').Request} req - The Express request object, containing authenticated user details.
 * @param {import('express').Response} res - The Express response object used to send back the statistics or an error.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const getCodeStats = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Statistics are only available for authenticated users',
    });
  }

  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  // This is a fast, read-only operation and does not need to be offloaded.
  const stats = await codeService.getCodeStats(userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Code statistics retrieved successfully',
    data: stats,
  });
});

/**
 * @typedef {object} CodeController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} performCodeTask - Handles requests for code generation or assistance.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getCodeStats - Retrieves code usage statistics for the authenticated user.
 */

/**
 * CodeController provides handlers for code-related API endpoints.
 * It encapsulates the logic for performing code tasks and retrieving user statistics.
 * @type {CodeController}
 */
export const codeController = {
  performCodeTask,
  getCodeStats,
};