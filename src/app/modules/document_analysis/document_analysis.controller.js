import httpStatus from 'http-status';
import express from 'express';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
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
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // This import is no longer needed after logic correction.
import { RESPONSE_MESSAGES } from './document_analysis.constant.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// --- Google Cloud Storage Configuration ---
// The GCS client automatically uses credentials from the environment
// (GOOGLE_APPLICATION_CREDENTIALS) or the attached service account in a GCP environment.
const storage = new Storage();
// CRITICAL: The GCS bucket name must be configured via an environment variable.
const gcsBucketName = process.env.GCS_DOCUMENT_BUCKET;
if (!gcsBucketName) {
  logger.error(
    'GCS_DOCUMENT_BUCKET environment variable not set. File uploads will fail.'
  );
  // In a production environment, you might want to throw an error here
  // to prevent the server from starting in a misconfigured state.
  // throw new Error('GCS_DOCUMENT_BUCKET environment variable not set.');
}

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
 * @property {string} originalname - The original name of the uploaded file.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} location - The canonical GCS URI of the uploaded file (e.g., 'gs://my-bucket/uploads/user123/file.pdf').
 * @property {object} gcs - GCS-specific details for the service layer.
 * @property {string} gcs.bucket - The GCS bucket name.
 * @property {string} gcs.path - The path to the object within the bucket.
 */

/**
 * @typedef {object} AnalyzeDocumentRequestBody
 * @property {string} [message] - The text content to analyze. Required if no file is uploaded.
 * @property {string} [conversationId] - The ID of an existing conversation to continue.
 * @property {string} [analysisType] - The type of analysis to perform (e.g., 'summary', 'qa').
 * @property {string} [outputFormat] - The desired format for the analysis output (e.g., 'markdown', 'json').
 */

/**
 * @typedef {object} AnalyzeDocumentResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} messageId - The ID of the generated message.
 * @property {string} response - The analysis result.
 * @property {string} [fileUrl] - A secure, temporary GCS Signed URL for accessing the processed file, if applicable.
 */

/**
 * @typedef {object} ConversationHistoryResponseData
 * @property {string} _id - The ID of the conversation entry.
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} userId - The ID of the user.
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} [fileUrl] - A secure, temporary GCS Signed URL for accessing the file associated with the message, if any.
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
 * @param {import('express').Request & { file?: Express.Multer.File, isGuest?: boolean, user?: { userId: string, _id: string } }} req - The Express request object.
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
 *         description: Forbidden - Usage limit exceeded or no active subscription
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const analyzeDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  // --- Security Enhancement: User ID Management ---
  // User ID must be immutably sourced from the authentication token (for logged-in users)
  // or generated server-side (for guests). Allowing it to be overridden from the request
  // body is a critical security vulnerability that could lead to data tampering and
  // unauthorized access to other users' conversations.
  const userId = isGuest
    ? documentAnalysisService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, analysisType, outputFormat } = req.body;

  // --- Rate Limiting ---
  // Apply rate limiting early to prevent resource abuse before any heavy processing.
  const rateLimitKey = isGuest ? req.ip : userId;
  const limiter = isGuest ? analysisGuestLimiter : analysisAuthLimiter;

  try {
    await limiter.consume(rateLimitKey);
  } catch (rateLimiterRes) {
    logger.warn(
      `Rate limit exceeded for ${
        isGuest ? 'guest' : 'user'
      } ${rateLimitKey} on analyzeDocument`
    );
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please slow down and try again later.',
    });
  }

  // --- GCS File Upload & Input Validation ---
  // This logic replaces local filesystem writes. It streams the uploaded file
  // directly to a GCS bucket, ensuring the application remains stateless. This requires
  // an upstream middleware like Multer to be configured with 'memoryStorage' to
  // provide the file in `req.file.buffer`.
  let fileInfo = null;
  if (req.file) {
    if (!gcsBucketName) {
      logger.error(
        'Cannot process file upload: GCS_DOCUMENT_BUCKET is not configured.'
      );
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'File upload service is not configured correctly.',
      });
    }

    // Sanitize and create a unique GCS path for the file to prevent collisions and path traversal.
    const safeOriginalName = req.file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const uniqueFileName = `${uuidv4()}-${safeOriginalName}`;
    const gcsFilePath = `uploads/${userId}/${uniqueFileName}`;
    const file = storage.bucket(gcsBucketName).file(gcsFilePath);

    try {
      // Stream the buffer from memory directly to GCS.
      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
        },
        // For large files (>10MB), consider setting resumable: true
        resumable: false,
      });

      const gcsUri = `gs://${gcsBucketName}/${gcsFilePath}`;
      logger.info(`File successfully uploaded for user ${userId} to ${gcsUri}`);

      // This object is passed to the service layer for further processing.
      fileInfo = {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        location: gcsUri, // The canonical GCS URI.
        gcs: {
          bucket: gcsBucketName,
          path: gcsFilePath,
        },
      };
    } catch (error) {
      logger.error(`GCS upload failed for user ${userId}:`, error);
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to upload file to cloud storage.',
      });
    }
  }

  // A user must provide content to be analyzed, either as text or a file.
  if (!fileInfo && (!message || message.trim() === '')) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message:
        'Request must include a file or a non-empty message for analysis.',
    });
  }

  logger.info(
    `Analysis request from ${isGuest ? 'guest' : 'user'} ${userId}`,
    { hasFile: !!fileInfo, hasMessage: !!message, conversationId, analysisType }
  );

  // --- Subscription & Usage Limit Enforcement for Authenticated Users ---
  if (!isGuest) {
    // Find the user's most recent (and presumably active) subscription plan.
    const subscription = await SubscriptionModel.findOne({ userId })
      .sort({
        createdAt: -1,
      })
      .lean();

    // --- Logic Correction: Usage Limit Check ---
    // The previous logic was flawed. This corrected logic properly checks if the user's
    // current usage has met or exceeded their plan's limit.
    // This assumes the SubscriptionModel contains `currentUsage` and `usageLimit` fields.
    if (!subscription || subscription.currentUsage >= subscription.usageLimit) {
      logger.warn(
        `Usage limit exceeded for user ${userId}. Current: ${subscription?.currentUsage}, Limit: ${subscription?.usageLimit}`
      );
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'Usage limit exceeded or no active subscription. Please upgrade your plan.',
      });
    }
  }

  // --- Service Layer Call ---
  // The service layer is responsible for the core business logic. It will receive
  // the `fileInfo` object containing the GCS location. When returning a `fileUrl`
  // in the response, the service layer should generate a GCS V4 Signed URL for
  // secure, temporary access to the file.
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
 *                     $ref: '#/components/schemas/ConversationHistoryResponseData'
 *       400:
 *         description: Bad Request - Invalid conversation ID format
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

  // --- Input Validation ---
  // Validate that the conversationId is a valid MongoDB ObjectId before querying the database.
  // This prevents malformed queries, potential errors, and provides a clearer error to the client.
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Invalid conversation ID format.',
    });
  }

  // --- Rate Limiting ---
  try {
    await historyLimiter.consume(userId || req.ip);
  } catch (rateLimiterRes) {
    logger.warn(
      `Rate limit exceeded for user ${
        userId || req.ip
      } on getConversationHistory`
    );
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  }

  logger.info(
    `Fetching conversation history: ${conversationId} for user ${userId}`
  );

  // The service layer must ensure that the conversation belongs to the requesting userId
  // to maintain data isolation and privacy. The service layer is also responsible for
  // generating GCS Signed URLs for any `fileUrl` fields in the response.
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