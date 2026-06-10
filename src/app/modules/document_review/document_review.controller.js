import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { documentReviewService } from './document_review.service.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * @typedef {object} FileInfo
 * @property {string} filename - The name of the file on the server.
 * @property {string} originalName - The original name of the uploaded file.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} path - The temporary path of the file on the server.
 * @property {string} location - The final storage location (e.g., S3 URL) or temporary path.
 */

/**
 * @typedef {object} ConversationalAssistantResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} response - The assistant's response message.
 * @property {boolean} success - Indicates if the request was processed successfully.
 * @property {boolean} [needsFile] - True if the assistant requires a file for the current context.
 * @property {boolean} [needsMoreInfo] - True if the assistant requires more information from the user.
 * @property {string} [userId] - The user ID, included for guest users.
 */

/**
 * @typedef {object} ReviewDocumentResponseData
 * @property {string} reviewId - The ID of the review process.
 * @property {string} summary - A summary of the document review.
 * @property {object} findings - Detailed findings from the review.
 * @property {string} [userId] - The user ID, included for guest users.
 */

/**
 * @typedef {object} ConversationMessage
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} timestamp - ISO date string of when the message was created.
 */

/**
 * @typedef {object} ConversationHistoryResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} title - The title of the conversation.
 * @property {ConversationMessage[]} messages - An array of messages in the conversation.
 * @property {object} [metadata] - Optional metadata associated with the conversation.
 * @property {string} createdAt - ISO date string of when the conversation was created.
 * @property {string} updatedAt - ISO date string of when the conversation was last updated.
 */

/**
 * @typedef {object} BadRequestResponse
 * @property {number} statusCode - HTTP status code, e.g., 400.
 * @property {boolean} success - Indicates if the request was successful, always false for errors.
 * @property {string} message - A descriptive error message.
 * @property {object} [data] - Optional additional error data.
 */

/**
 * @typedef {object} UnauthorizedResponse
 * @property {number} statusCode - HTTP status code, e.g., 401.
 * @property {boolean} success - Indicates if the request was successful, always false for errors.
 * @property {string} message - A descriptive error message.
 */

/**
 * @typedef {object} InternalServerErrorResponse
 * @property {number} statusCode - HTTP status code, e.g., 500.
 * @property {boolean} success - Indicates if the request was successful, always false for errors.
 * @property {string} message - A descriptive error message.
 * @property {object} [data] - Optional additional error data.
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     FileInfo:
 *       type: object
 *       properties:
 *         filename:
 *           type: string
 *           description: The name of the file on the server.
 *         originalName:
 *           type: string
 *           description: The original name of the uploaded file.
 *         mimetype:
 *           type: string
 *           description: The MIME type of the file.
 *         size:
 *           type: number
 *           description: The size of the file in bytes.
 *         path:
 *           type: string
 *           description: The temporary path of the file on the server.
 *         location:
 *           type: string
 *           description: The final storage location (e.g., S3 URL) or temporary path.
 *       example:
 *         filename: "doc_12345.pdf"
 *         originalName: "MyContract.pdf"
 *         mimetype: "application/pdf"
 *         size: 102400
 *         path: "/tmp/uploads/doc_12345.pdf"
 *         location: "https://s3.amazonaws.com/mybucket/doc_12345.pdf"
 *
 *     ConversationalAssistantResponseData:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: The ID of the conversation.
 *           example: "654321abcdef"
 *         response:
 *           type: string
 *           description: The assistant's response message.
 *           example: "I have summarized the document for you."
 *         success:
 *           type: boolean
 *           description: Indicates if the request was processed successfully.
 *           example: true
 *         needsFile:
 *           type: boolean
 *           description: True if the assistant requires a file for the current context.
 *           example: false
 *         needsMoreInfo:
 *           type: boolean
 *           description: True if the assistant requires more information from the user.
 *           example: false
 *         userId:
 *           type: string
 *           description: The user ID, included for guest users.
 *           example: "guest_12345"
 *
 *     ReviewDocumentResponseData:
 *       type: object
 *       properties:
 *         reviewId:
 *           type: string
 *           description: The ID of the review process.
 *           example: "review_7890"
 *         summary:
 *           type: string
 *           description: A summary of the document review.
 *           example: "The contract appears to be standard, with minor risks identified in clause 5.2."
 *         findings:
 *           type: object
 *           description: Detailed findings from the review.
 *           example:
 *             legal_risks: ["Clause 5.2 has ambiguous language regarding liability."]
 *             key_clauses: ["Indemnification", "Termination"]
 *         userId:
 *           type: string
 *           description: The user ID, included for guest users.
 *           example: "guest_12345"
 *
 *     ConversationMessage:
 *       type: object
 *       properties:
 *         role:
 *           type: string
 *           description: The role of the message sender (e.g., 'user', 'assistant').
 *           enum: [user, assistant]
 *           example: "assistant"
 *         content:
 *           type: string
 *           description: The content of the message.
 *           example: "Hello! How can I help you with your document today?"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: ISO date string of when the message was created.
 *           example: "2023-10-27T10:00:00Z"
 *
 *     ConversationHistoryResponseData:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: The ID of the conversation.
 *           example: "654321abcdef"
 *         title:
 *           type: string
 *           description: The title of the conversation.
 *           example: "Contract Review for Acme Corp"
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ConversationMessage'
 *           description: An array of messages in the conversation.
 *         metadata:
 *           type: object
 *           description: Optional metadata associated with the conversation.
 *           example:
 *             documentName: "Acme_Contract_v1.pdf"
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: ISO date string of when the conversation was created.
 *           example: "2023-10-27T09:00:00Z"
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: ISO date string of when the conversation was last updated.
 *           example: "2023-10-27T10:30:00Z"
 *
 *     BadRequestResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 400
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: Message is required
 *     UnauthorizedResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 401
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: User authentication required
 *     InternalServerErrorResponse:
 *       type: object
 *       properties:
 *         statusCode:
 *           type: number
 *           example: 500
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: An error occurred while processing your request
 *
 *   responses:
 *     BadRequest:
 *       description: Bad Request - Invalid input or missing required fields.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BadRequestResponse'
 *     Unauthorized:
 *       description: Unauthorized - Authentication token is missing or invalid.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UnauthorizedResponse'
 *     InternalServerError:
 *       description: Internal Server Error - An unexpected error occurred on the server.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InternalServerErrorResponse'
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * Conversational document review assistant endpoint
 * Handles natural language requests for document review with file upload.
 * @summary Engage with the AI document review assistant conversationally.
 * @description This endpoint allows users to interact with an AI assistant for document review using natural language.
 * It supports file uploads for document context and can continue existing conversations.
 * Guest users are supported with auto-generated IDs. Subscription limits are enforced for authenticated users.
 * @tags Document Review
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-review/conversational-assistant:
 *   post:
 *     summary: Engage with the AI document review assistant conversationally.
 *     description: This endpoint allows users to interact with an AI assistant for document review using natural language. It supports file uploads for document context and can continue existing conversations. Guest users are supported with auto-generated IDs. Subscription limits are enforced for authenticated users.
 *     tags:
 *       - Document Review
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
 *                 description: The user's natural language message or query.
 *                 example: "Summarize this document."
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "654321abcdef"
 *               userId:
 *                 type: string
 *                 description: Optional user ID for guest users (if not derived from session/token).
 *                 example: "guest_12345"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional document file to be reviewed.
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's natural language message or query.
 *                 example: "What is the capital of France?"
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue.
 *                 example: "654321abcdef"
 *               userId:
 *                 type: string
 *                 description: Optional user ID for guest users (if not derived from session/token).
 *                 example: "guest_12345"
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
 *                   example: Request processed successfully
 *                 data:
 *                   $ref: '#/components/schemas/ConversationalAssistantResponseData'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden - Subscription limit reached.
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
 *                   example: You have reached your document review limit for this month. Please upgrade your plan to continue.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  console.log('Is Guest:', isGuest);
  let userId = isGuest
    ? documentReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  console.log('User ID:', userId);
  const { message, conversationId } = req.body;
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
    `Document review assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      conversationId,
    }
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Added .lean() for performance as the document is only read.
    // Indexing Recommendation: Consider adding a compound index on `userId` and `createdAt`
    // in SubscriptionModel for faster lookups and sorting: `{ userId: 1, createdAt: -1 }`.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean(); // Added .lean()
    const promptUsage = userSubscription ? userSubscription.usage : 0;

    // Optimization Note: The `conversationHelpers.getConversationById` function
    // should ideally use `.lean()` internally if the returned conversation document
    // is not modified before being used.
    // Indexing Recommendation: Ensure the Conversation model has indexes on `conversationId` and `userId`
    // for efficient lookups within `getConversationById`.
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
          'You have reached your document review limit for this month. Please upgrade your plan to continue.',
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
    const result = await documentReviewService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      isGuest
    );

    logger.info('Document review assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsFile: result.needsFile,
      needsMoreInfo: result.needsMoreInfo,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Direct review endpoint (non-conversational)
 * For programmatic access with all parameters provided.
 * @summary Directly review a document with specified parameters.
 * @description This endpoint allows for direct, non-conversational document review by providing all necessary parameters and the document file.
 * It's suitable for programmatic integration. Guest users are supported with auto-generated IDs. Subscription limits are enforced for authenticated users.
 * @tags Document Review
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-review/review-document:
 *   post:
 *     summary: Directly review a document with specified parameters.
 *     description: This endpoint allows for direct, non-conversational document review by providing all necessary parameters and the document file. It's suitable for programmatic integration. Guest users are supported with auto-generated IDs. Subscription limits are enforced for authenticated users.
 *     tags:
 *       - Document Review
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - reviewType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The document file to be reviewed.
 *               reviewType:
 *                 type: string
 *                 description: The type of review to perform (e.g., 'compliance', 'summary', 'risk').
 *                 example: "compliance"
 *               reviewDepth:
 *                 type: string
 *                 description: The depth of the review (e.g., 'shallow', 'deep').
 *                 enum: [shallow, deep]
 *                 example: "deep"
 *               documentType:
 *                 type: string
 *                 description: The type of document being reviewed (e.g., 'contract', 'report').
 *                 example: "contract"
 *               aspects:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific aspects to focus on during the review.
 *                 example: ["legal_risks", "key_clauses"]
 *               additionalInstructions:
 *                 type: string
 *                 description: Any additional instructions for the AI.
 *                 example: "Pay close attention to indemnification clauses."
 *               userId:
 *                 type: string
 *                 description: Optional user ID for guest users (if not derived from session/token).
 *                 example: "guest_12345"
 *     responses:
 *       200:
 *         description: Document reviewed successfully.
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
 *                   example: Document reviewed successfully
 *                 data:
 *                   $ref: '#/components/schemas/ReviewDocumentResponseData'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Forbidden - Subscription limit reached.
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
 *                   example: You have reached your document review limit for this month. Please upgrade your plan to continue.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export const reviewDocument = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? documentReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  userId = req.body.userId || userId;

  // Check subscription limits for authenticated users
  if (!isGuest) {
    // Optimization: Added .lean() for performance as the document is only read.
    // Indexing Recommendation: Consider adding a compound index on `userId` and `createdAt`
    // in SubscriptionModel for faster lookups and sorting: `{ userId: 1, createdAt: -1 }`.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean(); // Added .lean()
    const promptUsage = userSubscription ? userSubscription.usage : 0;

    if (promptUsage <= 0) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your document review limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  // Handle file upload
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

  if (!fileInfo) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Document file is required',
    });
  }

  const reviewParams = {
    reviewType: req.body.reviewType,
    reviewDepth: req.body.reviewDepth,
    documentType: req.body.documentType,
    aspects: req.body.aspects,
    additionalInstructions: req.body.additionalInstructions,
  };

  logger.info('Direct document review request', {
    userId,
    filename: fileInfo.originalName,
    reviewType: reviewParams.reviewType,
  });

  try {
    const result = await documentReviewService.reviewDocument(
      fileInfo,
      reviewParams,
      userId,
      isGuest,
      req
    );

    logger.info('Document review completed successfully');

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Document reviewed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Error in direct document review:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to review document',
      data: {
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Get conversation history.
 * @summary Retrieve the full history of a specific conversation.
 * @description This endpoint fetches all messages and metadata for a given conversation ID,
 * accessible only by the authenticated user who owns the conversation.
 * @tags Document Review
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @openapi
 * /api/v1/document-review/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve the full history of a specific conversation.
 *     description: This endpoint fetches all messages and metadata for a given conversation ID, accessible only by the authenticated user who owns the conversation.
 *     tags:
 *       - Document Review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation to retrieve.
 *         example: "654321abcdef"
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
 *                   example: Conversation history retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/ConversationHistoryResponseData'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Conversation not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Conversation not found
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    // Optimization Note: The `conversationHelpers.getConversationById` function
    // should ideally use `.lean()` internally if the returned conversation document
    // is not modified before being sent in the response.
    // Indexing Recommendation: Ensure the Conversation model has indexes on `conversationId` and `userId`
    // for efficient lookups within `getConversationById`.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
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
      message: 'Conversation history retrieved successfully',
      data: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        messages: conversation.messages,
        metadata: conversation.metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to fetch conversation history',
    });
  }
});

/**
 * @namespace documentReviewController
 * @description Controller for handling document review related API requests.
 * Contains functions for conversational AI interaction, direct document review,
 * and retrieving conversation history.
 */
export const documentReviewController = {
  conversationalAssistant,
  reviewDocument,
  getConversationHistory,
};