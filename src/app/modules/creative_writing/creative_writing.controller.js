import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { creativeWritingService } from './creative_writing.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * @typedef {object} ConversationalAssistantRequestBody
 * @property {string} message - The user's message or prompt for the creative writing assistant.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [userId] - Optional user ID, primarily for guest users to maintain session across requests.
 */

/**
 * @typedef {object} ConversationalAssistantResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {boolean} success - Indicates if the request was processed successfully.
 * @property {boolean} [needsClarification] - Indicates if the assistant needs more information.
 * @property {object} [writingParams] - Parameters related to the generated writing.
 * @property {string} [writingParams.writingType] - The type of writing generated (e.g., 'story', 'poem').
 * @property {string} [userId] - The user ID, returned for guest users to maintain session.
 * @property {string} response - The AI's generated response.
 */

/**
 * Conversational creative writing assistant endpoint.
 * Handles natural language requests for creative writing, managing user sessions (guest/authenticated)
 * and enforcing subscription limits for authenticated users.
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @swagger
 * /api/v1/creative-writing/assistant:
 *   post:
 *     summary: Interact with the conversational creative writing assistant.
 *     description: |
 *       This endpoint allows users to send prompts to a creative writing AI assistant.
 *       It supports both guest users (who get a generated userId) and authenticated users.
 *       For authenticated users, it checks subscription limits before processing the request.
 *       The assistant can continue existing conversations or start new ones.
 *     tags:
 *       - Creative Writing
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConversationalAssistantRequestBody'
 *     responses:
 *       200:
 *         description: Request processed successfully.
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
 *                   $ref: '#/components/schemas/ConversationalAssistantResponseData'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 * components:
 *   schemas:
 *     ConversationalAssistantRequestBody:
 *       type: object
 *       required:
 *         - message
 *       properties:
 *         message:
 *           type: string
 *           description: The user's message or prompt for the creative writing assistant.
 *           example: "Write a short story about a detective solving a mystery in a futuristic city."
 *         conversationId:
 *           type: string
 *           description: Optional ID of an existing conversation to continue.
 *           example: "654321098765432109876543"
 *         userId:
 *           type: string
 *           description: Optional user ID, primarily for guest users to maintain session across requests.
 *                         If not provided for a guest, one will be generated.
 *           example: "guest_12345"
 *     ConversationalAssistantResponseData:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: The ID of the conversation.
 *           example: "654321098765432109876543"
 *         response:
 *           type: string
 *           description: The AI's response.
 *           example: "In the neon-drenched alleys of Neo-Kyoto..."
 *         success:
 *           type: boolean
 *           description: True if the request was processed successfully.
 *           example: true
 *         needsClarification:
 *           type: boolean
 *           description: True if the AI needs more information from the user.
 *           example: false
 *         writingParams:
 *           type: object
 *           properties:
 *             writingType:
 *               type: string
 *               description: The type of writing generated (e.g., 'story', 'poem').
 *               example: "story"
 *         userId:
 *           type: string
 *           description: The user ID, returned for guest users to maintain session.
 *           example: "guest_12345"
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  console.log('Is Guest:', isGuest);

  let userId = isGuest
    ? creativeWritingService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  console.log('User ID:', userId);

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId; // Allow guest userId to be passed in body for continuity
  console.log('Final User ID:', userId);

  logger.info(
    `Creative writing assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      conversationId,
      messageLength: message?.length,
    }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    // Note: conversationHelpers.getConversationById typically returns a conversation object.
    // The comparison `promptUsage <= totalConversationWithConvId` implies `totalConversationWithConvId`
    // is expected to be a numeric value representing usage. This logic might need review
    // if `getConversationById` does not return a comparable numeric value.
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        )
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your creative writing limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await creativeWritingService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest,
      req
    );

    logger.info('Creative writing assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsClarification: result.needsClarification,
      writingType: result.writingParams?.writingType,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined, // Only return userId for guests to maintain session
      },
    });
  } catch (error) {
    logger.error('Error in creative writing assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message ||
        'An error occurred while processing your creative writing request',
    });
  }
});

/**
 * @typedef {object} ConversationMessage
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} timestamp - The timestamp when the message was created (ISO 8601 format).
 */

/**
 * @typedef {object} ConversationHistoryResponseData
 * @property {string} _id - The ID of the conversation.
 * @property {string} userId - The ID of the user associated with the conversation.
 * @property {Array<ConversationMessage>} messages - An array of message objects in the conversation.
 * @property {string} createdAt - The creation timestamp of the conversation (ISO 8601 format).
 * @property {string} updatedAt - The last update timestamp of the conversation (ISO 8601 format).
 */

/**
 * Retrieves the conversation history for a specific creative writing session.
 * @function
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @swagger
 * /api/v1/creative-writing/conversations/{conversationId}:
 *   get:
 *     summary: Get creative writing conversation history.
 *     description: Retrieves the full message history for a specified creative writing conversation.
 *     tags:
 *       - Creative Writing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
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
 *                   $ref: '#/components/schemas/ConversationHistoryResponseData'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 * components:
 *   schemas:
 *     ConversationMessage:
 *       type: object
 *       properties:
 *         role:
 *           type: string
 *           description: The role of the message sender (e.g., 'user', 'assistant').
 *           example: "user"
 *         content:
 *           type: string
 *           description: The content of the message.
 *           example: "Tell me a story about a brave knight."
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: The timestamp when the message was created.
 *           example: "2023-10-27T10:00:00.000Z"
 *     ConversationHistoryResponseData:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: The ID of the conversation.
 *           example: "654321098765432109876543"
 *         userId:
 *           type: string
 *           description: The ID of the user associated with the conversation.
 *           example: "654321098765432109876542"
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ConversationMessage'
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: The creation timestamp of the conversation.
 *           example: "2023-10-27T09:50:00.000Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: The last update timestamp of the conversation.
 *           example: "2023-10-27T10:05:00.000Z"
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  logger.info('Getting creative writing conversation history', {
    userId,
    conversationId,
  });

  try {
    const conversation = await creativeWritingService.getConversationHistory(
      conversationId,
      userId,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error getting conversation history:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.NOT_FOUND,
      success: false,
      message: error.message || 'Conversation not found',
    });
  }
});

/**
 * @namespace creativeWritingController
 * @description Controller methods for handling creative writing assistant requests and conversation management.
 * This object groups all the route handlers related to the creative writing module.
 */
export const creativeWritingController = {
  conversationalAssistant,
  getConversationHistory,
};