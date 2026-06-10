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
 * @param {import('express').Request & { file?: FileInfo, isGuest?: boolean, user?: { userId: string, _id: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api {post} /api/v1/document-analysis/analyze Analyze Document/Text
 * @apiName AnalyzeDocument
 * @apiGroup DocumentAnalysis
 * @apiDescription Analyze document or text content.
 *
 * @apiHeader {String} [Authorization] Bearer token for authenticated users.
 * @apiHeader {String} Content-Type multipart/form-data or application/json
 *
 * @apiBody {String} [message] The text content to analyze. Required if no file is uploaded.
 * @apiBody {String} [conversationId] The ID of an existing conversation to continue.
 * @apiBody {String} [analysisType] The type of analysis to perform (e.g., 'summary', 'qa').
 * @apiBody {String} [outputFormat] The desired format for the analysis output (e.g., 'markdown', 'json').
 * @apiBody {File} [file] The document file to upload for analysis. Required if no message is provided.
 *
 * @apiSuccess (200 OK) {Number} statusCode 200
 * @apiSuccess (200 OK) {Boolean} success true
 * @apiSuccess (200 OK) {String} message "Document analysis successful"
 * @apiSuccess (200 OK) {AnalyzeDocumentResponseData} data The analysis result and conversation details.
 *
 * @apiError (400 Bad Request) {Number} statusCode 400
 * @apiError (400 Bad Request) {Boolean} success false
 * @apiError (400 Bad Request) {String} message "Neither file nor message provided for analysis."
 *
 * @apiError (403 Forbidden) {Number} statusCode 403
 * @apiError (403 Forbidden) {Boolean} success false
 * @apiError (403 Forbidden) {String} message "Usage limit exceeded. Please upgrade your subscription."
 *
 * @apiError (500 Internal Server Error) {Number} statusCode 500
 * @apiError (500 Internal Server Error) {Boolean} success false
 * @apiError (500 Internal Server Error) {String} message "Internal Server Error"
 */
export const analyzeDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? documentAnalysisService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, analysisType, outputFormat } = req.body;
  userId = req.body.userId || userId;

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
 * @param {import('express').Request & { user?: { userId: string, _id: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api {get} /api/v1/document-analysis/conversations/:conversationId Get Conversation History
 * @apiName GetConversationHistory
 * @apiGroup DocumentAnalysis
 * @apiDescription Retrieve the history of a specific conversation.
 *
 * @apiHeader {String} Authorization Bearer token for authenticated users.
 *
 * @apiParam {String} conversationId The unique identifier of the conversation.
 *
 * @apiSuccess (200 OK) {Number} statusCode 200
 * @apiSuccess (200 OK) {Boolean} success true
 * @apiSuccess (200 OK) {String} message "Conversation history retrieved successfully"
 * @apiSuccess (200 OK) {ConversationHistoryResponseData[]} data An array of conversation messages/turns.
 *
 * @apiError (404 Not Found) {Number} statusCode 404
 * @apiError (404 Not Found) {Boolean} success false
 * @apiError (404 Not Found) {String} message "Conversation not found or not accessible."
 *
 * @apiError (500 Internal Server Error) {Number} statusCode 500
 * @apiError (500 Internal Server Error) {Boolean} success false
 * @apiError (500 Internal Server Error) {String} message "Internal Server Error"
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

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