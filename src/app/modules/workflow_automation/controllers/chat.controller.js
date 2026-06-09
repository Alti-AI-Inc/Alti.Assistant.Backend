import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowCreationService } from '../services/workflowCreation.service.js';
import mongoose from 'mongoose';

/**
 * @swagger
 * /api/v1/chat/workflow/create:
 *   post:
 *     summary: Create a new workflow from a natural language prompt
 *     description: Allows a user to initiate the creation of a workflow by providing a natural language prompt.
 *                  The system will process the prompt and may return a workflow plan for confirmation or directly create the workflow.
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
 *                 example: "vid-conv-1678886400000-abc123def"
 *     responses:
 *       200:
 *         description: Workflow plan created, awaiting confirmation, or workflow created successfully.
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
 *                   example: "Workflow plan created, awaiting confirmation"
 *                 data:
 *                   type: object
 *                   properties:
 *                     needsConfirmation:
 *                       type: boolean
 *                       description: Indicates if the workflow requires user confirmation before final creation.
 *                       example: true
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the ongoing conversation.
 *                       example: "vid-conv-1678886400000-abc123def"
 *                     workflowPlan:
 *                       type: object
 *                       description: The proposed workflow plan details (if needsConfirmation is true).
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles the request to create a new workflow from a natural language prompt.
 *
 * This controller function extracts the prompt and an optional conversation ID from the request body.
 * It authenticates the user and validates the prompt. If valid, it calls the
 * `workflowCreationService` to process the prompt and initiate workflow creation.
 * The response indicates whether the workflow plan needs confirmation or if the workflow was created directly.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.body - The request body containing the prompt and optional conversationId.
 * @param {string} req.body.prompt - The natural language prompt for workflow creation.
 * @param {string} [req.body.conversationId] - Optional. An existing conversation ID to continue.
 * @param {object} req.user - The authenticated user object, typically containing `_id`.
 * @param {string} req.user._id - The ID of the authenticated user.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {Error} If an unexpected error occurs during workflow creation.
 */
const createWorkflowFromPromptController = catchAsync(async (req, res) => {
  const { prompt, conversationId } = req.body;
  const userId = req.user?._id || new mongoose.Types.ObjectId().toString(); // Fallback for testing or specific scenarios

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required',
    });
  }

  try {
    const result = await workflowCreationService.createWorkflowFromPrompt(
      userId,
      prompt,
      conversationId
    );

    logger.info(`Workflow creation initiated for user ${userId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.needsConfirmation
        ? 'Workflow plan created, awaiting confirmation'
        : 'Workflow created successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in createWorkflowFromPromptController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to create workflow',
    });
  }
});

/**
 * Generates a unique conversation ID.
 *
 * This function creates a simple, unique identifier for conversations
 * by combining a prefix, the current timestamp, and a random alphanumeric string.
 *
 * @returns {string} A unique conversation ID string.
 */
const generateConversationId = () => {
  return `vid-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

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
 *                 example: "vid-conv-1678886400000-abc123def"
 *               approved:
 *                 type: boolean
 *                 description: Set to `true` if the user approves the workflow plan, `false` otherwise.
 *                 example: true
 *               modifications:
 *                 type: string
 *                 description: Optional. A natural language description of requested modifications if `approved` is `false`.
 *                 example: "Please change the report frequency to weekly instead of daily."
 *     responses:
 *       200:
 *         description: Workflow confirmation processed successfully.
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
 *                   example: "Workflow confirmed and created."
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       description: The ID of the newly created workflow (if approved).
 *                       example: "60d0fe4f5b867d001c8f1a7a"
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the ongoing conversation.
 *                       example: "vid-conv-1678886400000-abc123def"
 *                     message:
 *                       type: string
 *                       description: A descriptive message about the outcome.
 *                       example: "Workflow confirmed and created."
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles the request to confirm or modify a proposed workflow plan.
 *
 * This controller function takes a `conversationId`, an `approved` flag, and optional `modifications`
 * from the request body. It ensures the user is authenticated and the `conversationId` is provided.
 * It then calls the `workflowCreationService` to process the confirmation or modification request.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.body - The request body containing confirmation details.
 * @param {string} req.body.conversationId - The ID of the conversation to confirm.
 * @param {boolean} req.body.approved - A boolean indicating if the workflow plan is approved (`true`) or needs modification (`false`).
 * @param {string} [req.body.modifications] - Optional. A description of requested modifications if `approved` is `false`.
 * @param {object} req.user - The authenticated user object, typically containing `_id`.
 * @param {string} req.user._id - The ID of the authenticated user.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {Error} If an unexpected error occurs during workflow confirmation.
 */
const confirmWorkflowCreationController = catchAsync(async (req, res) => {
  const { conversationId, approved, modifications } = req.body;
  const userId = req.user?._id || req.userId; // Assuming req.userId might be set by auth middleware

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    const result = await workflowCreationService.confirmWorkflowCreation(
      userId,
      conversationId,
      approved,
      modifications
    );

    logger.info(
      `Workflow confirmation processed for conversation ${conversationId}`
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    logger.error('Error in confirmWorkflowCreationController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to confirm workflow creation',
    });
  }
});

/**
 * @swagger
 * /api/v1/chat/conversation/continue:
 *   post:
 *     summary: Continue an existing chat conversation
 *     description: Allows a user to send a new message within an ongoing conversation,
 *                  potentially leading to further workflow automation steps or information retrieval.
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
 *                 example: "vid-conv-1678886400000-abc123def"
 *               message:
 *                 type: string
 *                 description: The new message from the user.
 *                 example: "Can you also include the number of active users?"
 *     responses:
 *       200:
 *         description: Conversation continued successfully.
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
 *                   example: "Conversation continued successfully"
 *                 data:
 *                   type: object
 *                   description: The updated conversation state or AI response.
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "vid-conv-1678886400000-abc123def"
 *                     response:
 *                       type: string
 *                       example: "Yes, I can add that to the report. Anything else?"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles the request to continue an existing chat conversation.
 *
 * This controller function expects a `conversationId` and a `message` in the request body.
 * It ensures the user is authenticated and both required fields are present.
 * It then calls the `workflowCreationService` to process the new message within the context
 * of the specified conversation.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.body - The request body containing the conversation ID and new message.
 * @param {string} req.body.conversationId - The ID of the conversation to continue.
 * @param {string} req.body.message - The new message from the user.
 * @param {object} req.user - The authenticated user object, typically containing `_id`.
 * @param {string} req.user._id - The ID of the authenticated user.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {Error} If an unexpected error occurs during conversation continuation.
 */
const continueConversationController = catchAsync(async (req, res) => {
  const { conversationId, message } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!conversationId || !message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID and message are required',
    });
  }

  try {
    const result = await workflowCreationService.continueConversation(
      userId,
      conversationId,
      message
    );

    logger.info(`Conversation continued for ${conversationId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation continued successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in continueConversationController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to continue conversation',
    });
  }
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
 *                   example: "Conversations retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "60d0fe4f5b867d001c8f1a7a"
 *                           title:
 *                             type: string
 *                             example: "Daily report workflow"
 *                           lastMessage:
 *                             type: string
 *                             example: "Workflow confirmed and created."
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T10:00:00.000Z"
 *                     total:
 *                       type: number
 *                       example: 5
 *                     limit:
 *                       type: number
 *                       example: 50
 *                     offset:
 *                       type: number
 *                       example: 0
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles the request to retrieve a list of conversations for the authenticated user.
 *
 * This controller function extracts pagination parameters (`limit`, `offset`) from the query string.
 * It ensures the user is authenticated and then calls the `workflowCreationService` to fetch
 * the user's conversations.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.query - The query parameters for pagination.
 * @param {string} [req.query.limit=50] - The maximum number of conversations to return.
 * @param {string} [req.query.offset=0] - The number of conversations to skip.
 * @param {object} req.user - The authenticated user object, typically containing `_id`.
 * @param {string} req.user._id - The ID of the authenticated user.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {Error} If an unexpected error occurs during conversation retrieval.
 */
const getUserConversationsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const { limit = 50, offset = 0 } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const conversations = await workflowCreationService.getUserConversations(
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversations retrieved successfully',
      data: {
        conversations,
        total: conversations.length, // Note: This 'total' is only for the current page, not overall. A service should provide true total.
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('Error in getUserConversationsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get conversations',
    });
  }
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
 *         example: "vid-conv-1678886400000-abc123def"
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully.
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
 *                   example: "Conversation retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "60d0fe4f5b867d001c8f1a7a"
 *                     userId:
 *                       type: string
 *                       example: "60d0fe4f5b867d001c8f1a7b"
 *                     conversationId:
 *                       type: string
 *                       example: "vid-conv-1678886400000-abc123def"
 *                     title:
 *                       type: string
 *                       example: "Daily report workflow"
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             enum: [user, assistant]
 *                             example: "user"
 *                           content:
 *                             type: string
 *                             example: "Create a workflow for daily reports."
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T09:55:00.000Z"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T09:50:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00.000Z"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Handles the request to retrieve a specific chat conversation by its ID.
 *
 * This controller function extracts the `conversationId` from the request parameters.
 * It ensures the user is authenticated and the `conversationId` is provided.
 * It then calls the `workflowCreationService` to fetch the conversation details.
 * If the conversation is not found or does not belong to the user, a 404 response is sent.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.params - The path parameters.
 * @param {string} req.params.conversationId - The ID of the conversation to retrieve.
 * @param {object} req.user - The authenticated user object, typically containing `_id`.
 * @param {string} req.user._id - The ID of the authenticated user.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 * @throws {Error} If an unexpected error occurs during conversation retrieval.
 */
const getConversationController = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    const conversation = await workflowCreationService.getConversation(
      conversationId,
      userId
    );

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error in getConversationController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get conversation',
    });
  }
});

/**
 * @description Controller for handling chat and workflow automation related requests.
 * This object groups all the controller functions for chat and workflow automation.
 * @type {object}
 * @property {function(import('express').Request, import('express').Response): Promise<void>} createWorkflowFromPromptController - Handles creating a workflow from a prompt.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} confirmWorkflowCreationController - Handles confirming or modifying a workflow plan.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} continueConversationController - Handles continuing an existing conversation.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getUserConversationsController - Handles retrieving a list of user's conversations.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getConversationController - Handles retrieving a specific conversation by ID.
 */
export const chatController = {
  createWorkflowFromPromptController,
  confirmWorkflowCreationController,
  continueConversationController,
  getUserConversationsController,
  getConversationController,
};