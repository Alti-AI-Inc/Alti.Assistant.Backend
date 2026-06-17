import httpStatus from 'http-status';
import { PubSub } from '@google-cloud/pubsub'; // GCP Pub/Sub import for asynchronous offloading
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { codeService } from './code.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import ConversationModel from '../conversations/conversation.model.js'; // For validating conversation ownership
import ApiError from '../../../errors/ApiError.js';
import { ROLES as USER_ROLES } from '../../config/roles.js'; // OPTIMIZATION: Use role constants for maintainability.
import { notificationService } from '../notification/notification.service.js'; // For admin notifications.

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
 *       For authenticated users, it checks the workspace's monthly subscription limits before processing the request.
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
 *         description: Forbidden. The workspace has reached its code assistance limit.
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
 *                   example: "Your workspace has reached its code assistance limit for this month. Please contact your administrator to upgrade the plan."
 *       404:
 *         description: Not Found. The specified conversation does not exist or is not accessible.
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
  const isGuest = req.isGuest || !req.user;
  const { message, conversationId } = req.body;

  // Establish user and workspace context early. Guests don't have a workspace.
  const userId = isGuest ? codeService.generateGuestUserId() : req.user?.userId;
  const workspaceId = isGuest ? null : req.user?.workspaceId;
  const userRole = isGuest ? (USER_ROLES.GUEST || 'guest') : req.user?.role;

  if (!message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A code query is required');
  }

  if (!isGuest && (!workspaceId || !userId)) {
    // This indicates a problem with the user's token or account setup.
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'User is not associated with a valid workspace.'
    );
  }

  // Hierarchical Subscription and Limit Check (for authenticated users)
  if (!isGuest) {
    // SECURE_SUBSCRIPTION_CHECK: Only consider 'active' subscriptions.
    // This prevents users on canceled or past-due plans from using paid features.
    const workspaceSubscription = await SubscriptionModel.findOne({
      workspaceId,
      status: 'active', // Ensure the subscription is currently active.
    }).lean();

    // The limit is defined by the workspace's plan or the default free tier.
    const monthlyLimit = workspaceSubscription
      ? workspaceSubscription.usageLimit // Assumes the field is named usageLimit
      : codeService.getDefaultFreeTierLimit();

    // Usage is counted for the entire workspace.
    const currentMonthlyUsage =
      await codeService.getMonthlyMessageCountForWorkspace(workspaceId);

    if (currentMonthlyUsage >= monthlyLimit) {
      // ENHANCED_ADMIN_VISIBILITY: Log a warning and notify admins when a workspace hits its limit.
      logger.warn(
        `Workspace ${workspaceId} has reached its code assistance limit of ${monthlyLimit} requests.`
      );
      // This call notifies workspace administrators, allowing them to take action (e.g., upgrade the plan).
      // The implementation of this service would handle the actual notification logic (email, in-app message, etc.).
      // The call is fire-and-forget; its failure should not block the user's error response.
      notificationService.notifyAdminsOfLimitReached(workspaceId).catch(err => {
        logger.error(
          `Failed to send limit notification for workspace ${workspaceId}:`,
          err
        );
      });

      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Your workspace has reached its code assistance limit for this month. Please contact your administrator to upgrade the plan.'
      );
    }
  }

  // IDOR_PREVENTION: Validate Conversation Ownership for authenticated users.
  if (conversationId && !isGuest) {
    // Ensure the user is not trying to access a conversation outside their workspace.
    const existingConversation = await ConversationModel.findOne({
      _id: conversationId,
      workspaceId: workspaceId, // This scopes the search to the user's workspace.
    }).lean();

    if (!existingConversation) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Conversation not found or you do not have permission to access it.'
      );
    }
  }

  const thread_id = conversationId || codeService.generateCodeConversationId();
  let actualConversationId;

  // Pass workspace context to service layer for correct data scoping and usage tracking.
  const conversation = await codeService.handleCodeConversation(
    userId,
    workspaceId, // Pass workspaceId
    conversationId,
    message,
    isGuest
  );
  actualConversationId = conversation.conversationId || thread_id;

  // The service layer is now responsible for attributing this message to the user AND the workspace.
  await codeService.addCodeQueryMessage(
    actualConversationId,
    userId,
    workspaceId, // Pass workspaceId
    message,
    isGuest
  );

  // Offload to Worker with Full Context
  const taskPayload = {
    conversationId: actualConversationId,
    userId,
    workspaceId, // CRITICAL: Pass workspaceId to the worker
    userRole, // Pass role for any potential downstream logic in the worker
    message,
    isGuest,
  };

  const dataBuffer = Buffer.from(JSON.stringify(taskPayload));
  const messageId = await pubSubClient
    .topic(codeAssistantTopicName)
    .publishMessage({ data: dataBuffer });

  logger.info(
    `Queued code assistant task ${messageId} for conversation: ${actualConversationId} in workspace: ${workspaceId}`
  );

  sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Your request has been accepted and is being processed.',
    data: {
      conversationId: actualConversationId,
      userType: isGuest ? 'guest' : 'authenticated',
      userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
    },
  });
});

/**
 * @swagger
 * /api/v1/code/stats:
 *   get:
 *     summary: Get code statistics.
 *     description: |
 *       Retrieves usage statistics related to the code assistant.
 *       - Authenticated users (role: 'user', 'manager') get their own personal statistics.
 *       - Workspace administrators (role: 'admin', 'super_admin') get statistics for the entire workspace.
 *       - This endpoint is not available for guest users.
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
 *                   description: Contains statistics for the user or the entire workspace, depending on the user's role.
 *                   properties:
 *                     scope:
 *                       type: string
 *                       enum: [user, workspace]
 *                       example: "workspace"
 *                     totalConversations:
 *                       type: number
 *                       example: 150
 *                     totalMessages:
 *                       type: number
 *                       example: 600
 *                     lastActivity:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00.000Z"
 *       401:
 *         description: Unauthorized. Statistics are only available for authenticated users.
 *       403:
 *         description: Forbidden. User does not have the required role.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller function to retrieve code assistant usage statistics.
 * Provides user-specific stats for standard users and workspace-wide stats for admins.
 * @function getCodeStats
 * @async
 * @param {import('express').Request} req - The Express request object, containing authenticated user details.
 * @param {import('express').Response} res - The Express response object used to send back the statistics or an error.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
export const getCodeStats = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Statistics are only available for authenticated users'
    );
  }

  const { userId, workspaceId, role } = req.user;

  if (!userId || !workspaceId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'User authentication details are incomplete.'
    );
  }

  let stats;
  // ROLE_BASED_ACCESS: Implement role-based access to statistics.
  // Admins and super_admins can view stats for the entire workspace.
  if ([USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN].includes(role)) {
    stats = await codeService.getWorkspaceCodeStats(workspaceId);
  } else if ([USER_ROLES.USER, USER_ROLES.MANAGER].includes(role)) {
    // Managers and users can only view their own stats.
    stats = await codeService.getUserCodeStats(userId);
  } else {
    // This case handles any other potential roles that shouldn't have access.
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have the required role to access statistics.'
    );
  }

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