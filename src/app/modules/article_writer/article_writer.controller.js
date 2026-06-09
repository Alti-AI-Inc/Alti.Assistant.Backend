import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { articleWriterService } from './article_writer.service.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * @swagger
 * /api/v1/article-writer/conversational-assistant:
 *   post:
 *     summary: Conversational Article Writer Assistant
 *     description: Handles natural language requests for article writing, supporting file uploads and managing user subscriptions.
 *     tags:
 *       - Article Writer
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: formData
 *         name: message
 *         type: string
 *         required: true
 *         description: The user's natural language prompt for article generation.
 *       - in: formData
 *         name: conversationId
 *         type: string
 *         required: false
 *         description: Optional ID of an existing conversation to continue.
 *       - in: formData
 *         name: articleType
 *         type: string
 *         required: false
 *         description: Desired type of article (e.g., "blog post", "news article").
 *       - in: formData
 *         name: tone
 *         type: string
 *         required: false
 *         description: Desired tone of the article (e.g., "formal", "casual", "informative").
 *       - in: formData
 *         name: length
 *         type: string
 *         required: false
 *         description: Desired length of the article (e.g., "short", "medium", "long").
 *       - in: formData
 *         name: file
 *         type: file
 *         required: false
 *         description: Optional file to be used as context or source material for the article.
 *     responses:
 *       200:
 *         description: Article generated successfully.
 *         schema:
 *           type: object
 *           properties:
 *             statusCode:
 *               type: number
 *               example: 200
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: Article generated successfully
 *             data:
 *               type: object
 *               properties:
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the conversation.
 *                 response:
 *                   type: string
 *                   description: The generated article content.
 *                 isGuest:
 *                   type: boolean
 *                   description: Indicates if the request was from a guest user.
 *       400:
 *         description: Bad Request - Message is required.
 *         schema:
 *           type: object
 *           properties:
 *             statusCode:
 *               type: number
 *               example: 400
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: Message is required
 *       403:
 *         description: Forbidden - Subscription limit reached.
 *         schema:
 *           type: object
 *           properties:
 *             statusCode:
 *               type: number
 *               example: 403
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: You have reached your article writing limit for this month. Please upgrade your plan to continue.
 *       500:
 *         description: Internal Server Error - Failed to generate article or user identifier.
 *         schema:
 *           type: object
 *           properties:
 *             statusCode:
 *               type: number
 *               example: 500
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: Failed to generate article
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  console.log('Is Guest:', isGuest);
  let userId = isGuest
    ? articleWriterService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  console.log('User ID:', userId);

  const { message, conversationId, articleType, tone, length } = req.body;
  userId = req.body.userId || userId;
  console.log('Final User ID:', userId);

  // Handle file upload if present
  const fileInfo = req.file
    ? {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        location: req.file.location || req.file.path,
      }
    : null;

  logger.info(
    `Article writer request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      conversationId,
      articleType,
      tone,
      length,
    }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Use .lean() for read-only queries to improve performance
    // Recommendation: Add an index on { userId: 1, createdAt: -1 } to the SubscriptionModel for faster lookups and sorting.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean(); // Added .lean()
    const promptUsage = userSubscription ? userSubscription.usage : 0;

    // Recommendation: Ensure conversationHelpers.getConversationById also uses .lean() if it fetches a Mongoose document
    // and consider adding appropriate indexes (e.g., on conversationId, userId) to the underlying conversation model.
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
          'You have reached your article writing limit for this month. Please upgrade your plan to continue.',
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
    // Recommendation: Ensure articleWriterService.processConversationalRequest
    // optimizes its internal database queries with .lean() and appropriate indexing.
    const result = await articleWriterService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      isGuest,
      articleType,
      tone,
      length,
      req
    );

    logger.info(
      `Article generated successfully for conversation ${result.conversationId}`
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Article generated successfully',
      data: {
        ...result,
        isGuest: isGuest,
      },
    });
  } catch (error) {
    logger.error('Error in conversational article writer:', error);

    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate article',
    });
  }
});

/**
 * @swagger
 * /api/v1/article-writer/conversations/{conversationId}:
 *   get:
 *     summary: Get Conversation History
 *     description: Retrieves the complete history of a specific article writing conversation.
 *     tags:
 *       - Article Writer
 *     security:
 *       - bearerAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         type: string
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
 *         schema:
 *           type: object
 *           properties:
 *             statusCode:
 *               type: number
 *               example: 200
 *             success:
 *               type: boolean
 *               example: true
 *             message:
 *               type: string
 *               example: Conversation history retrieved successfully
 *             data:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   userId:
 *                     type: string
 *                   conversationId:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [user, assistant]
 *                   content:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *       500:
 *         description: Internal Server Error - Failed to fetch conversation history.
 *         schema:
 *           type: object
 *           properties:
 *             statusCode:
 *               type: number
 *               example: 500
 *             success:
 *               type: boolean
 *               example: false
 *             message:
 *               type: string
 *               example: Failed to fetch conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    // Recommendation: Ensure articleWriterService.getConversationHistory uses .lean() for read-only queries
    // and has appropriate indexes (e.g., on conversationId, userId) on the underlying conversation message model.
    const conversation = await articleWriterService.getConversationHistory(
      conversationId,
      userId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);

    sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to fetch conversation history',
    });
  }
});

/**
 * @typedef {Object} ArticleWriterController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} conversationalAssistant - Handles conversational article writing requests.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getConversationHistory - Retrieves the history of a specific article writing conversation.
 */

/**
 * Controller for handling article writer related operations.
 * @type {ArticleWriterController}
 */
export const articleWriterController = {
  conversationalAssistant,
  getConversationHistory,
};