import httpStatus from 'http-status';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { articleWriterService } from './article_writer.service.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import ConversationModel from '../conversations/conversation.model.js';

// --- GCS Configuration ---
// The GCS client will automatically use the service account credentials
// available in the Cloud Run/Functions/GKE environment via Application Default Credentials.
const storage = new Storage();
// The GCS bucket name must be configured as an environment variable.
const gcsBucketName = process.env.GCS_ARTICLE_CONTEXT_BUCKET;
if (!gcsBucketName) {
  // Fail fast if the bucket isn't configured to prevent runtime errors.
  logger.error(
    'FATAL: GCS_ARTICLE_CONTEXT_BUCKET environment variable not set. File uploads will fail.'
  );
  // In a production app, you might throw an error to stop the server from starting.
  // throw new Error('GCS_ARTICLE_CONTEXT_BUCKET environment variable not set.');
}

// --- Constants for Input Validation ---
const ALLOWED_ARTICLE_TYPES = [
  'blog post',
  'news article',
  'technical article',
  'essay',
  'product review',
];
const ALLOWED_TONES = [
  'formal',
  'casual',
  'informative',
  'persuasive',
  'humorous',
];
const ALLOWED_LENGTHS = ['short', 'medium', 'long'];

// --- Constants for File Handling ---
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB limit for user-provided context files.
const ALLOWED_MIMETYPES = [
  'text/plain',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/markdown', // .md
];

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
 *         description: Desired type of article.
 *         enum: ["blog post", "news article", "technical article", "essay", "product review"]
 *       - in: formData
 *         name: tone
 *         type: string
 *         required: false
 *         description: Desired tone of the article.
 *         enum: ["formal", "casual", "informative", "persuasive", "humorous"]
 *       - in: formData
 *         name: length
 *         type: string
 *         required: false
 *         description: Desired length of the article.
 *         enum: ["short", "medium", "long"]
 *       - in: formData
 *         name: file
 *         type: file
 *         required: false
 *         description: Optional file (up to 15MB) to be used as context or source material for the article. Allowed types: .txt, .pdf, .doc, .docx, .md.
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
 *         description: Bad Request - Invalid or missing parameters, or invalid file.
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
 *               example: The "message" field is required.
 *       401:
 *         description: Unauthorized - Failed to identify user.
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
 *         description: Internal Server Error - Failed to generate article.
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

/**
 * Handles conversational article writing requests.
 * Supports guest and authenticated users, checks subscription limits, processes file uploads,
 * and invokes the article writer service to generate content.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  // --- 1. User Identification & Data Isolation ---
  const isGuest = req.isGuest || !req.user;
  // The userId is securely derived from the authenticated user's token or generated for guests.
  // This prevents users from accessing or acting on behalf of other users (IDOR vulnerability).
  const userId = isGuest
    ? articleWriterService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  if (!userId) {
    // This is an authentication/authorization issue, not an internal server error.
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Failed to identify user. Authentication may be required.',
    });
  }

  const { message, conversationId, articleType, tone, length } = req.body;

  // --- 2. Input Validation ---
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'The "message" field is required and cannot be empty.',
    });
  }
  if (articleType && !ALLOWED_ARTICLE_TYPES.includes(articleType)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid articleType. Allowed values are: ${ALLOWED_ARTICLE_TYPES.join(', ')}.`,
    });
  }
  if (tone && !ALLOWED_TONES.includes(tone)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid tone. Allowed values are: ${ALLOWED_TONES.join(', ')}.`,
    });
  }
  if (length && !ALLOWED_LENGTHS.includes(length)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: `Invalid length. Allowed values are: ${ALLOWED_LENGTHS.join(', ')}.`,
    });
  }

  // --- 3. File Handling & Validation (GCS Stream) ---
  let fileInfo = null;
  if (req.file) {
    // Ensure the GCS bucket is configured before proceeding.
    if (!gcsBucketName) {
      logger.error(
        'File upload failed: GCS_ARTICLE_CONTEXT_BUCKET is not configured on the server.'
      );
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message:
          'File upload service is currently unavailable. Please try again later.',
      });
    }

    // Validate file size to protect server resources and enforce user limits.
    if (req.file.size > MAX_FILE_SIZE_BYTES) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `File size exceeds the limit of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`,
      });
    }
    // Validate file type to ensure the backend can process it and for security.
    if (!ALLOWED_MIMETYPES.includes(req.file.mimetype)) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid file type. Allowed types are: ${ALLOWED_MIMETYPES.join(', ')}.`,
      });
    }

    // --- GCS Upload Logic ---
    // This block replaces writing to the local filesystem.
    // It streams the file buffer (from multer memory astorage) directly to a GCS bucket.
    const bucket = storage.bucket(gcsBucketName);
    // Create a unique filename to prevent collisions and organize by user.
    const gcsFileName = `article-context/${userId}/${uuidv4()}-${req.file.originalname.replace(/\s/g, '_')}`;
    const blob = bucket.file(gcsFileName);
    const blobStream = blob.createWriteStream({
      resumable: false, // Best for single-chunk uploads from a buffer.
      contentType: req.file.mimetype,
    });

    // Use a Promise to handle the async nature of the stream and await its completion.
    const gcsUploadPromise = new Promise((resolve, reject) => {
      blobStream.on('error', err => {
        logger.error(`GCS stream error for user ${userId}:`, err);
        reject(new Error('Failed to upload file to cloud storage.'));
      });

      blobStream.on('finish', () => {
        // The file has been successfully uploaded.
        // The GCS URI is the canonical reference to the file for backend services.
        const gcsUri = `gs://${gcsBucketName}/${gcsFileName}`;
        logger.info(`File uploaded to GCS for user ${userId} at ${gcsUri}`);
        resolve({
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          location: gcsUri, // Pass the GCS URI to the service layer.
        });
      });
    });

    // Start the stream by writing the buffer from memory.
    blobStream.end(req.file.buffer);

    // Wait for the upload to complete before proceeding.
    try {
      fileInfo = await gcsUploadPromise;
    } catch (uploadError) {
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: uploadError.message,
      });
    }
  }

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

  // --- 4. Usage Metrics & Subscription Limits ---
  if (!isGuest) {
    // OPTIMIZATION_NOTE: The `countDocuments` query below runs on every request for authenticated users.
    // This can become a performance bottleneck at scale. A more performant architecture would involve
    // a dedicated counter field (e.g., `monthlyUsageCount`) on the SubscriptionModel. This counter
    // would be atomically incremented after each successful generation and reset by a monthly cron job.
    // This would change the check to a single, fast read operation instead of a collection scan.

    const userSubscription = await SubscriptionModel.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean();

    // Convention: `usage: -1` for unlimited, `usage: 0` for no access, `usage > 0` for a specific limit.
    // Default to 0 (no access) if no subscription or usage field is found.
    const monthlyLimit = userSubscription?.usage ?? 0;

    // Skip check for unlimited plans.
    if (monthlyLimit !== -1) {
      const currentMonthStart = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );
      // INDEXING_RECOMMENDATION: Ensure ConversationModel has a compound index on { userId: 1, createdAt: 1 }.
      const userCurrentMonthUsage = await ConversationModel.countDocuments({
        userId: userId,
        createdAt: { $gte: currentMonthStart },
      });

      if (userCurrentMonthUsage >= monthlyLimit) {
        return sendResponse(res, {
          statusCode: httpStatus.FORBIDDEN,
          success: false,
          // Provide a more specific message based on the user's plan.
          message:
            monthlyLimit === 0
              ? 'Your current plan does not include article writing. Please upgrade to use this feature.'
              : 'You have reached your article writing limit for this month. Please upgrade your plan to continue.',
        });
      }
    }
  }

  // --- 5. Prompt Execution ---
  try {
    const result = await articleWriterService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo, // This now contains the GCS URI if a file was uploaded.
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
 *     description: Retrieves the complete history of a specific article writing conversation. Ensures user can only access their own conversations.
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
 *           $ref: '#/definitions/ConversationHistoryResponse'
 *       401:
 *         description: Unauthorized - Authentication is required.
 *       404:
 *         description: Not Found - Conversation does not exist or user does not have permission to view it.
 *       500:
 *         description: Internal Server Error - Failed to fetch conversation history.
 *
 * definitions:
 *   ConversationHistoryResponse:
 *     type: object
 *     properties:
 *       statusCode:
 *         type: number
 *         example: 200
 *       success:
 *         type: boolean
 *         example: true
 *       message:
 *         type: string
 *         example: Conversation history retrieved successfully
 *       data:
 *         type: array
 *         items:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             userId:
 *               type: string
 *             conversationId:
 *               type: string
 *             role:
 *               type: string
 *               enum: [user, assistant]
 *             content:
 *               type: string
 *             createdAt:
 *               type: string
 *               format: date-time
 */

/**
 * Retrieves the history of a specific article writing conversation.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>}
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  // Securely get the userId from the authenticated user's token.
  const userId = req.user?.userId || req.user?._id;

  // A userId must be present for authenticated routes.
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Authentication required.',
    });
  }

  logger.info(
    `Fetching conversation history for ${conversationId} by user ${userId}`
  );

  try {
    // OPTIMIZATION_RECOMMENDATION: Ensure articleWriterService.getConversationHistory uses .lean() for this read-only query.
    // INDEXING_RECOMMENDATION: The underlying model for conversation messages should have a compound index
    // on { conversationId: 1, userId: 1, createdAt: 1 } for efficient retrieval and sorting.

    // SECURITY: Pass the authenticated userId to the service layer.
    // The service must use this userId in the database query (e.g., find({ conversationId, userId }))
    // to ensure a user can only access their own conversations, preventing IDOR vulnerabilities.
    const conversation = await articleWriterService.getConversationHistory(
      conversationId,
      userId
    );

    // If the service returns null/empty, it means the conversation doesn't exist or doesn't belong to the user.
    // Responding with 404 prevents leaking information about the existence of conversations belonging to other users.
    if (!conversation || conversation.length === 0) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message:
          'Conversation not found or you do not have permission to view it.',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error(
      `Error fetching conversation history for ${conversationId}:`,
      error
    );

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
 * Generate a pre-signed URL for client-side uploads.
 */
export const generateUploadUrl = catchAsync(async (req, res) => {
  return sendResponse(res, {
    statusCode: httpStatus.NOT_IMPLEMENTED,
    success: false,
    message: 'GCS Upload URL generation is not yet implemented for article writer.',
  });
});

/**
 * Controller for handling article writer related operations.
 * @type {ArticleWriterController}
 */
export const articleWriterController = {
  conversationalAssistant,
  getConversationHistory,
  generateUploadUrl,
};