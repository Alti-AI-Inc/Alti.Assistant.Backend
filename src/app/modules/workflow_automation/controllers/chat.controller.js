import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowCreationService } from '../services/workflowCreation.service.js';
// Assumed service for checking subscription-based limits. This integrates billing/subscription context.
import { limitService } from '../../billing/services/limit.service.js';

// --- GCP Pub/Sub Integration ---
// Instantiate the Pub/Sub client.
// In a production environment, this should be initialized once as a singleton and shared across the application.
const pubSubClient = new PubSub();

// Define topic names for different background tasks.
// These topics must be created in your GCP project.
const WORKFLOW_PROMPT_TOPIC =
  process.env.WORKFLOW_PROMPT_TOPIC || 'workflow-creation-prompt-topic';
const WORKFLOW_CONFIRM_TOPIC =
  process.env.WORKFLOW_CONFIRM_TOPIC || 'workflow-creation-confirm-topic';
const CONVERSATION_CONTINUE_TOPIC =
  process.env.CONVERSATION_CONTINUE_TOPIC || 'conversation-continue-topic';
// --- End GCP Pub/Sub Integration ---

/**
 * @swagger
 * /api/v1/chat/workflow/create:
 *   post:
 *     summary: Create a new workflow from a natural language prompt
 *     description: Allows an authenticated user to initiate the creation of a workflow by providing a natural language prompt.
 *                  The system will check the user's workspace subscription limits before proceeding.
 *                  It may return a workflow plan for confirmation or directly create the workflow.
 *     tags:
 *       - Chat & Workflow Automation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The natural language prompt describing the desired workflow.
 *                 example: "Create a workflow that sends a daily report of new user signups to my email."
 *               conversationId:
 *                 type: string
 *                 description: Optional. An existing conversation ID to continue a previous interaction.
 *                 example: "conv-1678886400000-abc123def"
 *     responses:
 *       202:
 *         description: Request accepted for processing. The workflow creation will be handled asynchronously.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden. The user has reached a usage limit based on their subscription plan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const createWorkflowFromPromptController = catchAsync(async (req, res) => {
  const { prompt, conversationId } = req.body;
  // Auth middleware must ensure req.user with _id and workspaceId is present.
  const { _id: userId, workspaceId } = req.user;

  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A non-empty prompt is required',
    });
  }

  // --- LIMIT CHECK ---
  // Verify that the user's workspace is allowed to create a new workflow based on their subscription.
  const { allowed, message: limitMessage } =
    await limitService.canCreateWorkflow(workspaceId);
  if (!allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message:
        limitMessage ||
        'Workflow creation limit reached. Please upgrade your plan.',
    });
  }

  // --- REWRITTEN FOR ASYNC PROCESSING ---
  // Instead of processing in-memory, publish a message to Pub/Sub for a background worker to handle.
  // This prevents the HTTP request from timing out during long-running AI/LLM operations.
  const messageData = {
    userId: userId.toString(), // Ensure IDs are strings for JSON compatibility
    workspaceId: workspaceId.toString(),
    prompt,
    conversationId,
  };

  const dataBuffer = Buffer.from(JSON.stringify(messageData));

  try {
    const messageId = await pubSubClient
      .topic(WORKFLOW_PROMPT_TOPIC)
      .publishMessage({ data: dataBuffer });
    logger.info(
      `Workflow creation task for user ${userId} queued with messageId: ${messageId}`
    );
  } catch (error) {
    logger.error(
      `Failed to publish workflow creation message to Pub/Sub for user ${userId}:`,
      error
    );
    // If queuing fails, we must inform the user.
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to queue workflow creation task. Please try again later.',
    });
  }

  // Respond immediately with 202 Accepted, indicating the request is being processed asynchronously.
  return sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message:
      'Your request has been received and is being processed. We will notify you upon completion.',
    // Optionally, you can return the conversationId or a new task ID for status tracking.
    data: {
      status: 'processing',
      conversationId,
    },
  });
});

/**
 * @swagger
 * /api/v1/chat/workflow/confirm:
 *   post:
 *     summary: Confirm or modify a proposed workflow plan
 *     description: Allows a user to confirm a previously generated workflow plan or suggest modifications.
 *                  This is typically used after a `createWorkflowFromPrompt` call returns `needsConfirmation: true`.
 *     tags:
 *       - Chat & Workflow Automation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversationId
 *               - approved
 *             properties:
 *               conversationId:
 *                 type: string
 *                 description: The ID of the conversation associated with the workflow plan.
 *                 example: "conv-1678886400000-abc123def"
 *               approved:
 *                 type: boolean
 *                 description: Set to `true` if the user approves the workflow plan, `false` otherwise.
 *                 example: true
 *               modifications:
 *                 type: string
 *                 description: Optional. A natural language description of requested modifications if `approved` is `false`.
 *                 example: "Please change the report frequency to weekly instead of daily."
 *     responses:
 *       202:
 *         description: Confirmation accepted. The workflow finalization will be handled asynchronously.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const confirmWorkflowCreationController = catchAsync(async (req, res) => {
  const { conversationId, approved, modifications } = req.body;
  const { _id: userId, workspaceId } = req.user;

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  // The limit check is performed at the initiation step.
  // Confirming a workflow doesn't typically count as a new metered event.

  // --- REWRITTEN FOR ASYNC PROCESSING ---
  // Offload the confirmation and potential re-generation of the workflow to a background worker.
  const messageData = {
    userId: userId.toString(),
    workspaceId: workspaceId.toString(),
    conversationId,
    approved,
    modifications,
  };

  const dataBuffer = Buffer.from(JSON.stringify(messageData));

  try {
    const messageId = await pubSubClient
      .topic(WORKFLOW_CONFIRM_TOPIC)
      .publishMessage({ data: dataBuffer });
    logger.info(
      `Workflow confirmation task for conversation ${conversationId} queued with messageId: ${messageId}`
    );
  } catch (error) {
    logger.error(
      `Failed to publish workflow confirmation message to Pub/Sub for conversation ${conversationId}:`,
      error
    );
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to queue workflow confirmation task. Please try again later.',
    });
  }

  // Respond immediately with 202 Accepted.
  return sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message:
      'Confirmation received. Your workflow is being finalized in the background.',
    data: {
      status: 'processing',
      conversationId,
    },
  });
});

/**
 * @swagger
 * /api/v1/chat/conversation/continue:
 *   post:
 *     summary: Continue an existing chat conversation
 *     description: Allows a user to send a new message within an ongoing conversation.
 *                  The system will check the user's workspace subscription limits for message counts.
 *     tags:
 *       - Chat & Workflow Automation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conversationId
 *               - message
 *             properties:
 *               conversationId:
 *                 type: string
 *                 description: The ID of the conversation to continue.
 *                 example: "conv-1678886400000-abc123def"
 *               message:
 *                 type: string
 *                 description: The new message from the user.
 *                 example: "Can you also include the number of active users?"
 *     responses:
 *       202:
 *         description: Message accepted for processing. The conversation will be continued asynchronously.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden. The user has reached a usage limit based on their subscription plan.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const continueConversationController = catchAsync(async (req, res) => {
  const { conversationId, message } = req.body;
  const { _id: userId, workspaceId } = req.user;

  if (
    !conversationId ||
    !message ||
    typeof message !== 'string' ||
    message.trim() === ''
  ) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID and a non-empty message are required',
    });
  }

  // --- LIMIT CHECK ---
  // Verify that the user's workspace is allowed to send another message.
  const { allowed, message: limitMessage } =
    await limitService.canContinueConversation(workspaceId, conversationId);
  if (!allowed) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message:
        limitMessage ||
        'Conversation message limit reached. Please upgrade your plan.',
    });
  }

  // --- REWRITTEN FOR ASYNC PROCESSING ---
  // Offload the conversation processing to a background worker via Pub/Sub.
  const messageData = {
    userId: userId.toString(),
    workspaceId: workspaceId.toString(),
    conversationId,
    message,
  };

  const dataBuffer = Buffer.from(JSON.stringify(messageData));

  try {
    const messageId = await pubSubClient
      .topic(CONVERSATION_CONTINUE_TOPIC)
      .publishMessage({ data: dataBuffer });
    logger.info(
      `Conversation continuation task for ${conversationId} queued with messageId: ${messageId}`
    );
  } catch (error) {
    logger.error(
      `Failed to publish conversation continuation message to Pub/Sub for ${conversationId}:`,
      error
    );
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to queue your message. Please try again later.',
    });
  }

  // Respond immediately with 202 Accepted.
  return sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Your message is being processed.',
    data: {
      status: 'processing',
      conversationId,
    },
  });
});

/**
 * @swagger
 * /api/v1/chat/conversations:
 *   get:
 *     summary: Get a list of user's conversations
 *     description: Retrieves a paginated list of all chat conversations associated with the authenticated user.
 *     tags:
 *       - Chat & Workflow Automation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of conversations to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of conversations to skip before starting to collect the result set.
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const getUserConversationsController = catchAsync(async (req, res) => {
  const { _id: userId } = req.user;

  // Sanitize and validate pagination parameters
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '50', 10)));
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10));

  if (isNaN(limit) || isNaN(offset)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Invalid pagination parameters: limit and offset must be numbers.',
    });
  }

  const { conversations, totalCount } =
    await workflowCreationService.getUserConversations(userId, limit, offset);

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: {
      conversations,
      total: totalCount,
      limit,
      offset,
    },
  });
});

/**
 * @swagger
 * /api/v1/chat/conversations/{conversationId}:
 *   get:
 *     summary: Get a specific chat conversation by ID
 *     description: Retrieves the full details of a single chat conversation, including its history, by its ID.
 *                  The conversation must belong to the authenticated user.
 *     tags:
 *       - Chat & Workflow Automation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve.
 *         example: "conv-1678886400000-abc123def"
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const getConversationController = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const { _id: userId } = req.user;

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  // The service layer is responsible for finding the conversation and ensuring the userId matches.
  const conversation = await workflowCreationService.getConversation(
    conversationId,
    userId
  );

  if (!conversation) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Conversation not found or you do not have permission to view it.',
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
 * @description Controller for handling chat and workflow automation related requests.
 * This object groups all the controller functions for chat and workflow automation.
 * @type {object}
 */
export const chatController = {
  createWorkflowFromPromptController,
  confirmWorkflowCreationController,
  continueConversationController,
  getUserConversationsController,
  getConversationController,
};