import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { codeService } from './code.service.js';
import { codeAssistantApp } from './code_assistant/workflow.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { codeHelpers } from './code.helper.js';

/**
 * @swagger
 * /api/v1/code/perform-task:
 *   post:
 *     summary: Initiate a code generation or assistance task.
 *     description: |
 *       Handles requests for code generation or assistance from both authenticated and guest users.
 *       For authenticated users, it checks monthly subscription limits before processing the request.
 *       It interacts with an AI assistant to generate or modify code based on the user's message,
 *       manages conversation history, and saves messages and responses.
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
 *       200:
 *         description: Code task completed successfully.
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
 *                   example: "Code task completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI assistant's response, potentially containing code.
 *                       example: "```javascript\n// Your generated code here\n```"
 *                     conversationId:
 *                       type: string
 *                       format: uuid
 *                       description: The ID of the conversation.
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                     messageCount:
 *                       type: number
 *                       description: The total number of messages in the conversation after this interaction.
 *                       example: 4
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
export const performCodeTask = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? codeService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;

  // Skip subscription check for guest users
  if (!isGuest) {
    // Optimize: Add .lean() for read-only query to return a plain JavaScript object, reducing Mongoose overhead.
    // Indexing Recommendation: For SubscriptionModel, consider creating an index on `userId`
    // and a compound index on `{ userId: 1, createdAt: -1 }` to optimize this query and sort.
    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean(); // Added .lean()

    // Bug Fix: The previous logic for checking limits was flawed.
    // `totalConversationWithConvId` was incorrectly derived from `getConversationById`
    // which likely returns a conversation object, not a monthly message count.
    // We need to get the actual monthly message count for the user.
    // Also, `promptUsage` (from `userSubscription.usage`) represents the limit,
    // and if no subscription, a default free tier limit should apply.
    const monthlyLimit = userSubscription
      ? userSubscription.usage // Assuming 'usage' field stores the monthly limit
      : codeService.getDefaultFreeTierLimit(); // Assuming this service method provides a default limit for non-subscribers

    // Optimization Note: If codeService.getMonthlyMessageCount performs a read-only DB query,
    // consider adding .lean() within that function for similar performance benefits.
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

  try {
    // Handle conversation creation/retrieval
    // Optimization Note: If codeService.handleCodeConversation performs read-only DB queries,
    // consider adding .lean() within that function.
    const conversation = await codeService.handleCodeConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    // Optimization Note: If codeService.addCodeQueryMessage performs read-only DB queries,
    // consider adding .lean() within that function.
    await codeService.addCodeQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    // Bug Fix: The AI assistant needs the full conversation history for context.
    // The previous implementation only sent the latest message.
    // Assuming `codeService.getConversationHistory` retrieves messages in the format
    // `{ role: 'user' | 'assistant', content: string }[]`.
    const conversationHistory = await codeService.getConversationHistory(actualConversationId);

    const inputs = {
      userInput: message, // The user's latest message
      history: conversationHistory, // Now includes full conversation history
    };

    // This is an external AI model invocation, which is expected to be compute-intensive.
    // Optimizations for this part would be within the 'codeAssistantApp' implementation itself
    // or by scaling the underlying AI service.
    const result = await codeAssistantApp.invoke(inputs, {
      configurable: { thread_id: actualConversationId },
    });
    logger.info(
      `Code Assistant Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const fullResponse = result.response;

    // Add assistant response to conversation
    // Optimization Note: If codeService.addCodeResultMessage performs read-only DB queries,
    // consider adding .lean() within that function.
    await codeService.addCodeResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      {},
      isGuest,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Code task completed successfully',
      data: {
        ...codeHelpers.formatCodeResponse(
          fullResponse,
          actualConversationId,
          conversation.messageCount + 2 // Assuming messageCount is before this interaction, +2 for user query + AI response
        ),
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
      },
    });
  } catch (error) {
    logger.error('Code Assistant Error:', error);

    // Try to save error message to conversation if possible
    const errorConversationId =
      conversationId || codeService.generateCodeConversationId();
    try {
      if (errorConversationId && userId) {
        // Optimization Note: If codeService.addErrorMessage performs read-only DB queries,
        // consider adding .lean() within that function.
        await codeService.addErrorMessage(
          errorConversationId,
          userId,
          codeHelpers.formatErrorMessage(error, message),
          error,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while processing your code request',
      data: {
        conversationId: errorConversationId,
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

  // Optimization Note: If codeService.getCodeStats performs read-only DB queries,
  // consider adding .lean() within that function.
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