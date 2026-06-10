import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentAnalysisService } from './document_analysis.service.js';
import SubscriptionModel from '../payment/payment.model.js';
// Optimization: For better query performance on SubscriptionModel, consider adding indexes.
// For queries like `SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 })`,
// recommended indexes are:
// 1. { userId: 1 }
// 2. { userId: 1, createdAt: -1 } (a compound index for the find and sort combination)
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { RESPONSE_MESSAGES } from './document_analysis.constant.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Enterprise Rate-Limiting Configurations to prevent DDoS, API abuse, and LLM cost runaway.
// Using RateLimiterMemory as a highly reliable, zero-dependency in-memory fallback.
// For multi-server/distributed production environments, swap with RateLimiterRedis.
const analysisGuestLimiter = new RateLimiterMemory({
  points: 10, // 10 analysis requests
  duration: 3600, // per hour (60 minutes)
  blockDuration: 600, // Block for 10 minutes if exceeded
});

const analysisAuthLimiter = new RateLimiterMemory({
  points: 100, // 100 analysis requests
  duration: 3600, // per hour (60 minutes)
  blockDuration: 300, // Block for 5 minutes if exceeded
});

const historyLimiter = new RateLimiterMemory({
  points: 300, // 300 history retrieval requests
  duration: 900, // per 15 minutes
});

/**
 * @typedef {object} FileInfo
 * @property {string} filename - The name of the file on the server.
 * @property {string} originalname - The original name of the uploaded file.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} path - The temporary path where the file is stored.
 * @property {string} location - The final storage location (e.g., S3 URL or local path).
 */

/**
 * @typedef {object} AnalyzeDocumentRequestBody
 * @property {string} [message] - The text content to analyze. Required if no file is uploaded.
 * @property {string} [conversationId] - The ID of an existing conversation to continue.
 * @property {string} [analysisType] - The type of analysis to perform (e.g., 'summary', 'qa').
 * @property {string} [outputFormat] - The desired format for the analysis output (e.g., 'markdown', 'json').
 * @property {string} [userId] - Optional user ID, primarily for guest users or internal overrides.
 */

/**
 * @typedef {object} AnalyzeDocumentResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} messageId - The ID of the generated message.
 * @property {string} response - The analysis result.
 * @property {string} [fileUrl] - URL of the processed file, if applicable.
 */

/**
 * @typedef {object} ConversationHistoryResponseData
 * @property {string} _id - The ID of the conversation entry.
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} userId - The ID of the user.
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} [fileUrl] - URL of the file associated with the message, if any.
 * @property {Date} createdAt - The timestamp when the message was created.
 * @property {Date} updatedAt - The timestamp when the message was last updated.
 */

/**
 * Analyze document or text endpoint
 * Handles both file upload and text analysis with optional conversation context.
 *
 * @summary Analyze document or text content.
 * @description This endpoint processes either an uploaded document file or a text message for analysis.
 * It supports optional conversation context and different analysis types and output formats.
 * It also enforces subscription limits for authenticated users.
 *
 * @security Guest Access / Authenticated User
 * @permission Multi-tenant / User-isolated. Authenticated users are restricted by their subscription limits. Guests have auto-generated temporary IDs.
 *
 * @param {import('express').Request & { file?: FileInfo, isGuest?: boolean, user?: { userId: string, _id: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-analysis/analyze:
 *   post:
 *     summary: Analyze document or text content
 *     description: Processes either an uploaded document file or a text message for analysis. Enforces subscription limits for authenticated users.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The text content to analyze. Required if no file is uploaded.
 *               conversationId:
 *                 type: string
 *                 description: The ID of an existing conversation to continue.
 *               analysisType:
 *                 type: string
 *                 description: The type of analysis to perform (e.g., 'summary', 'qa').
 *               outputFormat:
 *                 type: string
 *                 description: The desired format for the analysis output (e.g., 'markdown', 'json').
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The document file to upload for analysis. Required if no message is provided.
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *               conversationId:
 *                 type: string
 *               analysisType:
 *                 type: string
 *               outputFormat:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document analysis successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Document analysis successful"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                     messageId:
 *                       type: string
 *                     response:
 *                       type: string
 *                     fileUrl:
 *                       type: string
 *       400:
 *         description: Bad Request - Neither file nor message provided
 *       403:
 *         description: Forbidden - Usage limit exceeded
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const analyzeDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? documentAnalysisService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, analysisType, outputFormat } = req.body;
  userId = req.body.userId || userId;

  // Apply Rate Limiting to prevent DDoS and cost runaway (LLM/API abuse)
  const rateLimitKey = isGuest ? req.ip : userId;
  const limiter = isGuest ? analysisGuestLimiter : analysisAuthLimiter;

  try {
    await limiter.consume(rateLimitKey);
  } catch (rateLimiterRes) {
    logger.warn(`Rate limit exceeded for ${isGuest ? 'guest' : 'authenticated'} user ${rateLimitKey} on analyzeDocument`);
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please slow down and try again later.',
    });
  }

  // Handle file upload if present
  const fileInfo = req.file
    ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        location: req.file.location || req.file.path,
      }
    : null;

  logger.info(
    `Document analysis request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      hasMessage: !!message,
      conversationId,
      analysisType,
    }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Added .lean() for performance as this is a read-only query and
    // we don't need Mongoose document methods or virtuals.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean();
    const promptUsage = userSubscription ? userSubscription.usage : 0;
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
        message: 'Usage limit exceeded. Please upgrade your subscription.',
      });
    }
  }

  // Perform analysis
  const result = await documentAnalysisService.analyzeContent(
    userId,
    message,
    fileInfo,
    conversationId,
    analysisType,
    outputFormat,
    isGuest,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: RESPONSE_MESSAGES.SUCCESS,
    data: result,
  });
});

/**
 * Get conversation history endpoint
 *
 * @summary Retrieve the history of a specific conversation.
 * @description Fetches all messages and analysis results associated with a given conversation ID for the authenticated user.
 *
 * @security Authenticated User
 * @permission Multi-tenant / User-isolated. Users can only access conversations belonging to their own `userId`.
 *
 * @param {import('express').Request & { user?: { userId: string, _id: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-analysis/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve the history of a specific conversation
 *     description: Fetches all messages and analysis results associated with a given conversation ID for the authenticated user.
 *     tags:
 *       - Document Analysis
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the conversation.
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       conversationId:
 *                         type: string
 *                       userId:
 *                         type: string
 *                       role:
 *                         type: string
 *                       content:
 *                         type: string
 *                       fileUrl:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Conversation not found or not accessible
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  // Apply Rate Limiting to prevent database abuse
  try {
    await historyLimiter.consume(userId || req.ip);
  } catch (rateLimiterRes) {
    logger.warn(`Rate limit exceeded for user ${userId || req.ip} on getConversationHistory`);
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  }

  logger.info(
    `Fetching conversation history: ${conversationId} for user ${userId}`
  );

  const conversation = await documentAnalysisService.getConversationHistory(
    conversationId,
    userId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation history retrieved successfully',
    data: conversation,
  });
});

/**
 * @namespace documentAnalysisController
 * @description Controller for handling document analysis and conversation-related operations.
 * This object groups all the route handlers for document analysis features.
 */
export const documentAnalysisController = {
  analyzeDocument,
  getConversationHistory,
};