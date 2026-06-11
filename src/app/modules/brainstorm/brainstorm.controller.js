import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { brainstormService } from './brainstorm.service.js';
import SubscriptionModel from '../payment/payment.model.js';
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // Optimization: Removed unused import

/**
 * @typedef {object} ConversationalAssistantRequest
 * @property {string} message.required - The user's natural language prompt for the assistant.
 * @property {string} [conversationId] - The ID of an existing conversation to continue.
 */

/**
 * @typedef {object} StructuredBrainstormRequest
 * @property {string} topic.required - The main topic for the brainstorm.
 * @property {string} [context] - Additional context or background information for the brainstorm.
 * @property {Array<string>} [keywords] - Specific keywords or phrases to include in the brainstorm.
 * @property {number} [numIdeas=5] - The desired number of ideas or points to generate.
 * @property {string} [format='list'] - The desired output format (e.g., 'list', 'mindmap_json', 'bullet_points').
 */

/**
 * @typedef {object} ExportBrainstormRequest
 * @property {string} conversationId.required - The ID of the conversation to export.
 * @property {'markdown'|'json'|'pdf'} [format='markdown'] - The desired export format.
 * @property {boolean} [includeHistory=true] - Whether to include the full conversation history in the export.
 */

/**
 * @typedef {object} RefineBrainstormRequest
 * @property {string} conversationId.required - The ID of the conversation to refine.
 * @property {string} message.required - The new prompt or instruction for refinement.
 * @property {Array<string>} [focusOn] - Specific elements or topics to focus on during refinement.
 */

/**
 * @typedef {object} ApiResponse
 * @property {number} statusCode - The HTTP status code of the response.
 * @property {boolean} success - Indicates if the request was successful.
 * @property {string} message - A descriptive message about the response.
 * @property {object} [data] - The payload data returned by the API.
 */

/**
 * Conversational brainstorm assistant endpoint
 * Handles natural language requests for brainstorming
 * @swagger
 * /api/v1/brainstorm/conversational:
 *   post:
 *     summary: Interact with the conversational brainstorm assistant
 *     description: Sends a natural language message to the AI assistant to generate or continue a brainstorm session.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - bearerAuth: []
 *       - guestAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConversationalAssistantRequest'
 *     responses:
 *       200:
 *         description: Request processed successfully. Returns the AI's response.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   description: The AI's response, potentially including new conversation messages or brainstorm ideas.
 *       400:
 *         description: Bad Request. Message is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       403:
 *         description: Forbidden. User has reached their brainstorm limit.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal Server Error. Failed to process brainstorm request.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *
 * @param {import('express').Request} req - Express request object. Supports guest users (`req.isGuest`) and authenticated users (`req.user`).
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  // Determine userId based on authentication status.
  // For authenticated users, userId must come from req.user to prevent IDOR.
  // For guests, a unique ID is generated.
  let userId = isGuest
    ? brainstormService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  // BUG/SECURITY VULNERABILITY: Allowing userId to be overridden from req.body is an IDOR vulnerability.
  // An attacker could pass another user's ID to perform actions on their behalf.
  // The userId should be strictly derived from the authenticated session or generated for guests.
  // userId = req.body.userId || userId; // REMOVED

  logger.info(
    `Brainstorm assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    { conversationId }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Use .lean() for read-only queries to improve performance by returning plain JavaScript objects.
    // Recommendation: Create a compound index on `userId` and `createdAt` for `SubscriptionModel`
    // to optimize this query: `db.subscriptions.createIndex({ userId: 1, createdAt: -1 })`
    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean();

    // BUG: The original logic `promptUsage <= totalConversationWithConvId` was flawed.
    // `userSubscription.usage` is assumed to be the remaining prompts, consistent with `generateBrainstorm`.
    // `totalConversationWithConvId` was incorrectly derived from `getConversationById` (a single conversation object)
    // and used in a comparison that didn't make sense for a monthly limit.
    // The correct check for a monthly limit based on remaining usage is to ensure `userSubscription` exists
    // and `userSubscription.usage` is greater than 0.
    if (!userSubscription || userSubscription.usage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
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

  // This check is still valid, as userId might be null if req.user was malformed
  // and generateGuestUserId somehow failed (though unlikely).
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await brainstormService.processConversationalBrainstorm(
      userId,
      message,
      conversationId,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);
    // Improvement: Respect custom status codes from service layer errors for more specific client feedback.
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to process brainstorm request',
    });
  }
});

/**
 * Structured brainstorm generation endpoint
 * For programmatic access with explicit parameters
 * @swagger
 * /api/v1/brainstorm/generate:
 *   post:
 *     summary: Generate a structured brainstorm
 *     description: Generates a brainstorm session based on explicit parameters provided in the request body.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - bearerAuth: []
 *       - guestAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StructuredBrainstormRequest'
 *     responses:
 *       200:
 *         description: Brainstorm generated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   description: The generated brainstorm data.
 *       403:
 *         description: Forbidden. User has reached their brainstorm limit.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal Server Error. Failed to generate brainstorm.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *
 * @param {import('express').Request} req - Express request object. Supports guest users (`req.isGuest`) and authenticated users (`req.user`).
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const generateBrainstorm = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  // Determine userId based on authentication status.
  // For authenticated users, userId must come from req.user to prevent IDOR.
  // For guests, a unique ID is generated.
  let userId = isGuest
    ? brainstormService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  // BUG/SECURITY VULNERABILITY: Allowing userId to be overridden from req.body is an IDOR vulnerability.
  // An attacker could pass another user's ID to perform actions on their behalf.
  // The userId should be strictly derived from the authenticated session or generated for guests.
  // userId = req.body.userId || userId; // REMOVED

  logger.info(
    `Structured brainstorm request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Use .lean() for read-only queries to improve performance by returning plain JavaScript objects.
    // Recommendation: Create a compound index on `userId` and `createdAt` for `SubscriptionModel`
    // to optimize this query: `db.subscriptions.createIndex({ userId: 1, createdAt: -1 })`
    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean();

    // BUG: The original logic `if (userSubscription && userSubscription.usage <= 0)`
    // would allow users without any subscription to bypass the limit check.
    // The correct check is to ensure `userSubscription` exists AND `userSubscription.usage` is greater than 0.
    // This aligns with the fix in `conversationalAssistant`.
    if (!userSubscription || userSubscription.usage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await brainstormService.generateStructuredBrainstorm(
      userId,
      req.body,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorm generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error generating structured brainstorm:', error);
    // Improvement: Respect custom status codes from service layer errors for more specific client feedback.
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate brainstorm',
    });
  }
});

/**
 * Get conversation history
 * @swagger
 * /api/v1/brainstorm/history/{conversationId}:
 *   get:
 *     summary: Retrieve conversation history
 *     description: Fetches the complete conversation history for a specific brainstorm session.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role:
 *                         type: string
 *                         description: The role of the speaker (e.g., 'user', 'assistant').
 *                       content:
 *                         type: string
 *                         description: The message content.
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         description: The timestamp of the message.
 *       404:
 *         description: Not Found. Conversation not found or user not authorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal Server Error. Failed to retrieve conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *
 * @param {import('express').Request} req - Express request object. Requires authenticated user (`req.user`).
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id; // Correctly derived from req.user

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    const result = await brainstormService.getConversationHistory(
      conversationId,
      userId, // userId passed for authorization check in service layer
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to retrieve conversation history',
    });
  }
});

/**
 * Export brainstorm session
 * @swagger
 * /api/v1/brainstorm/export:
 *   post:
 *     summary: Export a brainstorm session
 *     description: Exports the content of a brainstorm session in a specified format (e.g., Markdown, JSON).
 *     tags:
 *       - Brainstorm
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExportBrainstormRequest'
 *     responses:
 *       200:
 *         description: Brainstorm session exported successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *               properties:
 *                 data:
 *                   type: string
 *                   description: The exported content of the brainstorm session.
 *       400:
 *         description: Bad Request. Missing conversationId or invalid format.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Not Found. Conversation not found or user not authorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal Server Error. Failed to export brainstorm session.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *
 * @param {import('express').Request} req - Express request object. Requires authenticated user (`req.user`).
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const exportBrainstorm = catchAsync(async (req, res) => {
  const {
    conversationId,
    format = 'markdown',
    includeHistory = true,
  } = req.body;
  const userId = req.user?.userId || req.user?._id; // Correctly derived from req.user

  logger.info(`Exporting brainstorm session ${conversationId} as ${format}`);

  try {
    const result = await brainstormService.exportBrainstormSession(
      conversationId,
      userId, // userId passed for authorization check in service layer
      format,
      includeHistory,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorm session exported successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error exporting brainstorm session:', error);
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to export brainstorm session',
    });
  }
});

/**
 * Refine existing brainstorm
 * @swagger
 * /api/v1/brainstorm/refine:
 *   post:
 *     summary: Refine an existing brainstorm session
 *     description: Provides new input or specific focus areas to refine an ongoing brainstorm session.
 *     tags:
 *       - Brainstorm
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefineBrainstormRequest'
 *     responses:
 *       200:
 *         description: Brainstorm refined successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *               properties:
 *                 data:
 *                   type: object
 *                   description: The updated brainstorm data after refinement.
 *       400:
 *         description: Bad Request. Missing conversationId or message.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       404:
 *         description: Not Found. Conversation not found or user not authorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       500:
 *         description: Internal Server Error. Failed to refine brainstorm.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *
 * @param {import('express').Request} req - Express request object. Requires authenticated user (`req.user`).
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const refineBrainstorm = catchAsync(async (req, res) => {
  const { conversationId, message, focusOn = [] } = req.body;
  const userId = req.user?.userId || req.user?._id; // Correctly derived from req.user

  logger.info(`Refining brainstorm in conversation ${conversationId}`);

  try {
    const result = await brainstormService.refineBrainstorm(
      conversationId,
      userId, // userId passed for authorization check in service layer
      message,
      focusOn,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Brainstorm refined successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error refining brainstorm:', error);
    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to refine brainstorm',
    });
  }
});

/**
 * @namespace brainstormController
 * @description Controller for handling brainstorm-related API requests.
 * Provides endpoints for conversational AI, structured brainstorm generation,
 * conversation history retrieval, export, and refinement.
 * @type {object}
 * @property {import('express').RequestHandler} conversationalAssistant - Handles natural language requests for brainstorming.
 * @property {import('express').RequestHandler} generateBrainstorm - Generates a structured brainstorm based on explicit parameters.
 * @property {import('express').RequestHandler} getConversationHistory - Retrieves the complete conversation history for a specific brainstorm session.
 * @property {import('express').RequestHandler} exportBrainstorm - Exports the content of a brainstorm session in a specified format.
 * @property {import('express').RequestHandler} refineBrainstorm - Refines an ongoing brainstorm session with new input or focus areas.
 */
export const brainstormController = {
  conversationalAssistant,
  generateBrainstorm,
  getConversationHistory,
  exportBrainstorm,
  refineBrainstorm,
};