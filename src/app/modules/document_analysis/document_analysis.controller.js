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
// For queries like `SubscriptionModel.findOne({ workspaceId }).sort({ createdAt: -1 })`,
// a compound index on `{ workspaceId: 1, createdAt: -1 }` is recommended.
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
 * @property {string} location - The canonical GCS URI of the uploaded file (e.g., 'gs://my-bucket/uploads/workspace123/user456/file.pdf').
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
 * @property {string} workspaceId - The ID of the workspace.
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
 * It also enforces subscription limits for authenticated users based on their workspace.
 *
 * @security Guest Access / Authenticated User
 * @permission Multi-tenant / Workspace-isolated. Authenticated users are restricted by their workspace's subscription limits.
 * Roles (user, manager, admin) are handled by the service layer. Guests have auto-generated temporary IDs.
 *
 * @param {import('express').Request & { file?: Express.Multer.File, isGuest?: boolean, user?: { userId: string, _id: string, role: string, workspaceId: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-analysis/analyze:
 *   post:
 *     summary: Analyze document or text content
 *     description: Processes either an uploaded document file or a text message for analysis. Enforces workspace subscription limits for authenticated users.
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
 *                   $ref: '#/components/schemas/AnalyzeDocumentResponseData'
 *       400:
 *         description: Bad Request - Neither file nor message provided
 *       401:
 *         description: Unauthorized - Authenticated user does not have a workspace ID
 *       403:
 *         description: Forbidden - Workspace usage limit exceeded or no active subscription
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const analyzeDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const { message, conversationId, analysisType, outputFormat } = req.body;

  // --- Security Enhancement: User & Tenant Context Management ---
  // User context must be immutably sourced from the authentication token.
  // For authenticated users, this includes userId, role, and workspaceId.
  // For guests, a temporary ID is generated.
  let userId;
  let workspaceId = null; // Guests do not have a workspace.

  if (isGuest) {
    userId = documentAnalysisService.generateGuestUserId();
  } else {
    userId = req.user?.userId || req.user?._id;
    workspaceId = req.user?.workspaceId;
    // CRITICAL: Authenticated users must belong to a workspace to use the service.
    if (!workspaceId) {
      logger.error(
        `User ${userId} attempted to perform an action without a workspaceId.`
      );
      return sendResponse(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message:
          'User is not associated with a workspace. Access denied.',
      });
    }
  }

  // --- Rate Limiting ---
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

    // Sanitize and create a unique, tenant-aware GCS path for the file.
    const safeOriginalName = req.file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const uniqueFileName = `${uuidv4()}-${safeOriginalName}`;
    // HIERARCHY FIX: Isolate uploads by workspace for better data management and security.
    const gcsObjectPath = isGuest
      ? `uploads/guests/${userId}/${uniqueFileName}`
      : `uploads/${workspaceId}/${userId}/${uniqueFileName}`;
    const file = storage.bucket(gcsBucketName).file(gcsObjectPath);

    try {
      await file.save(req.file.buffer, {
        metadata: { contentType: req.file.mimetype },
        resumable: false,
      });

      const gcsUri = `gs://${gcsBucketName}/${gcsObjectPath}`;
      logger.info(`File successfully uploaded for user ${userId} to ${gcsUri}`);

      fileInfo = {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        location: gcsUri,
        gcs: {
          bucket: gcsBucketName,
          path: gcsObjectPath,
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

  if (!fileInfo && (!message || message.trim() === '')) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message:
        'Request must include a file or a non-empty message for analysis.',
    });
  }

  logger.info(
    `Analysis request from ${
      isGuest ? 'guest' : `user ${userId} in workspace ${workspaceId}`
    }`,
    { hasFile: !!fileInfo, hasMessage: !!message, conversationId, analysisType }
  );

  // --- HIERARCHY FIX: Workspace Subscription & Usage Limit Enforcement ---
  if (!isGuest) {
    // Subscriptions are tied to the workspace, not the individual user.
    const subscription = await SubscriptionModel.findOne({ workspaceId })
      .sort({ createdAt: -1 })
      .lean();

    if (!subscription || subscription.currentUsage >= subscription.usageLimit) {
      logger.warn(
        `Usage limit exceeded for workspace ${workspaceId} (user: ${userId}). Current: ${subscription?.currentUsage}, Limit: ${subscription?.usageLimit}`
      );
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'Workspace usage limit exceeded or no active subscription. Please contact your administrator.',
      });
    }
  }

  // --- Service Layer Call ---
  // Pass the full user context (req.user) to the service layer.
  // The service layer is responsible for core business logic, including incrementing
  // workspace usage, handling role-based permissions, and generating notifications.
  const result = await documentAnalysisService.analyzeContent(
    message,
    fileInfo,
    conversationId,
    analysisType,
    outputFormat,
    isGuest,
    isGuest ? { userId } : req.user // Pass a consistent user context object
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
 * @description Fetches all messages for a given conversation ID. Access is determined by user role within their workspace.
 *
 * @security Authenticated User
 * @permission Multi-tenant / Role-based.
 * - 'user' role can only access their own conversations.
 * - 'manager' and 'admin' roles can access all conversations within their workspace.
 *
 * @param {import('express').Request & { user?: { userId: string, _id: string, role: string, workspaceId: string } }} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-analysis/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve the history of a specific conversation
 *     description: Fetches messages for a conversation. Access is role-based within the user's workspace.
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
 *       401:
 *         description: Unauthorized - User context is missing
 *       404:
 *         description: Conversation not found or not accessible by the user
 *       429:
 *         description: Too Many Requests - Rate limit exceeded
 *       500:
 *         description: Internal Server Error
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  // HIERARCHY FIX: The entire user context (including role and workspaceId) is needed for authorization.
  const userContext = req.user;

  if (!userContext || !userContext.userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Authentication details are missing.',
    });
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Invalid conversation ID format.',
    });
  }

  // --- Rate Limiting ---
  try {
    await historyLimiter.consume(userContext.userId);
  } catch (rateLimiterRes) {
    logger.warn(
      `Rate limit exceeded for user ${userContext.userId} on getConversationHistory`
    );
    return sendResponse(res, {
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  }

  logger.info(
    `Fetching conversation history: ${conversationId} for user ${userContext.userId} in workspace ${userContext.workspaceId}`
  );

  // HIERARCHY FIX: Pass the full user context to the service layer.
  // The service layer is now responsible for implementing role-based access control (RBAC).
  // e.g., it will check if (conversation.userId === user.userId) OR
  // (conversation.workspaceId === user.workspaceId AND user.role IN ['admin', 'manager']).
  const conversation = await documentAnalysisService.getConversationHistory(
    conversationId,
    userContext
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