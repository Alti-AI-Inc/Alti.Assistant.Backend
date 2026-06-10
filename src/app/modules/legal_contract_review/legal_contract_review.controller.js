import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { legalContractReviewService } from './legal_contract_review.service.js';
// BUG FIX: Added missing import for conversationHelpers.
// Assuming conversationHelpers is a named export from a local helper file.
import { conversationHelpers } from './conversation.helpers.js';

/**
 * @typedef {object} FileInfo
 * @property {string} filename - The name of the file on the server.
 * @property {string} originalName - The original name of the file uploaded by the user.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} path - The temporary path where the file is stored.
 * @property {string} location - The final storage location (e.g., S3 URL or local path).
 */

/**
 * @typedef {object} ConversationalAssistantRequestBody
 * @property {string} message - The user's natural language message or query.
 * @property {string} [conversationId] - The ID of an existing conversation to continue.
 * @property {'text'|'json'|'markdown'} [outputFormat='text'] - The desired format for the assistant's response.
 */

/**
 * @typedef {object} ConversationalAssistantResponseData
 * @property {string} conversationId - The ID of the current conversation.
 * @property {string} response - The assistant's natural language response.
 * @property {boolean} needsContract - Indicates if the assistant requires a contract file for further processing.
 * @property {boolean} needsMoreInfo - Indicates if the assistant requires more information from the user.
 * @property {string} [userId] - The guest user ID, if the request was made by a guest.
 * @property {boolean} success - Indicates if the operation was successful.
 */

/**
 * @typedef {object} ErrorResponse
 * @property {number} statusCode - The HTTP status code.
 * @property {boolean} success - Always false for error responses.
 * @property {string} message - A descriptive error message.
 */

/**
 * Conversational legal contract review assistant endpoint
 * Handles natural language requests for contract review with file upload or text input
 * @swagger
 * /api/v1/legal-contract-review/conversational-assistant:
 *   post:
 *     summary: Interact with the AI legal contract review assistant conversationally.
 *     description: This endpoint allows users to send natural language messages to an AI assistant for legal contract review. It supports continuing existing conversations and optionally uploading a contract file.
 *     tags:
 *       - Legal Contract Review
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's natural language message or query for the assistant.
 *                 example: "Can you review this contract for unfair clauses?"
 *               conversationId:
 *                 type: string
 *                 description: Optional. The ID of an existing conversation to continue. If not provided, a new conversation will be started.
 *                 example: "654321abcdef"
 *               outputFormat:
 *                 type: string
 *                 enum: [text, json, markdown]
 *                 default: text
 *                 description: Optional. The desired format for the assistant's response.
 *                 example: "markdown"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional. A contract file (e.g., PDF, DOCX, TXT) to be reviewed.
 *           encoding:
 *             file:
 *               contentType: application/octet-stream
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
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the current conversation.
 *                       example: "123456abcdef"
 *                     response:
 *                       type: string
 *                       description: The assistant's natural language response.
 *                       example: "Certainly, I can help review your contract. Please upload the document."
 *                     needsContract:
 *                       type: boolean
 *                       description: Indicates if the assistant requires a contract file for further processing.
 *                       example: true
 *                     needsMoreInfo:
 *                       type: boolean
 *                       description: Indicates if the assistant requires more information from the user.
 *                       example: false
 *                     userId:
 *                       type: string
 *                       description: The guest user ID, if the request was made by a guest.
 *                       example: "guest-12345"
 *                       nullable: true
 *       400:
 *         description: Bad Request. Message is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               MessageRequired:
 *                 value:
 *                   statusCode: 400
 *                   success: false
 *                   message: "Message is required"
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               FailedToProcess:
 *                 value:
 *                   statusCode: 500
 *                   success: false
 *                   message: "Failed to process contract review request"
 *               FailedToGenerateUserId:
 *                 value:
 *                   statusCode: 500
 *                   success: false
 *                   message: "Failed to generate user identifier"
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? legalContractReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, outputFormat } = req.body;
  // BUG FIX: Removed potential IDOR vulnerability.
  // An authenticated user should not be able to override their userId from req.body.
  // A guest user's userId should be generated by the system, not provided by the client.
  // userId = req.body.userId || userId; // This line was removed to prevent IDOR.

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
    `Legal contract review request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      conversationId,
      outputFormat,
    }
  );

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
    const result =
      await legalContractReviewService.processConversationalRequest(
        userId,
        message,
        conversationId,
        fileInfo,
        outputFormat || 'text',
        isGuest
      );

    logger.info('Legal contract review assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsContract: result.needsContract,
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
      message: error.message || 'Failed to process contract review request',
    });
  }
});

/**
 * @typedef {object} ReviewContractRequestBody
 * @property {string} [contractText] - The full text of the contract to be reviewed. Required if no file is uploaded.
 * @property {string} [reviewType] - The type of review requested (e.g., "compliance", "risk_assessment", "summary").
 * @property {string[]} [specificClauses] - An array of specific clauses or sections to focus the review on.
 * @property {string} [outputFormat='json'] - The desired output format for the review results.
 * @property {string} [customInstructions] - Any custom instructions or specific questions for the review.
 */

/**
 * @typedef {object} ReviewContractResponseData
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} message - A descriptive message about the review outcome.
 * @property {object} reviewResults - The detailed results of the contract review.
 * @property {string} reviewResults.summary - A summary of the contract review.
 * @property {Array<object>} reviewResults.issues - A list of identified issues or risks.
 * @property {Array<object>} reviewResults.clauses - Analysis of specific clauses.
 * @property {string} [reviewResults.fullReport] - A link or content of a full report.
 */

/**
 * Direct contract review endpoint (non-conversational)
 * For programmatic access with all parameters
 * @swagger
 * /api/v1/legal-contract-review/review-contract:
 *   post:
 *     summary: Perform a direct, non-conversational legal contract review.
 *     description: This endpoint allows for programmatic submission of contracts for review, either by uploading a file or providing contract text directly. It supports various review parameters.
 *     tags:
 *       - Legal Contract Review
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               contractText:
 *                 type: string
 *                 description: The full text of the contract to be reviewed. Required if no file is uploaded.
 *                 example: "This agreement is made between Party A and Party B..."
 *               reviewType:
 *                 type: string
 *                 description: The type of review requested (e.g., "compliance", "risk_assessment", "summary").
 *                 example: "risk_assessment"
 *               specificClauses:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of specific clauses or sections to focus the review on.
 *                 example: ["Termination Clause", "Indemnification"]
 *               outputFormat:
 *                 type: string
 *                 enum: [json, text, markdown]
 *                 default: json
 *                 description: The desired output format for the review results.
 *                 example: "json"
 *               customInstructions:
 *                 type: string
 *                 description: Any custom instructions or specific questions for the review.
 *                 example: "Focus on potential liabilities for Party A."
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional. A contract file (e.g., PDF, DOCX, TXT) to be reviewed. Required if `contractText` is not provided.
 *           encoding:
 *             file:
 *               contentType: application/octet-stream
 *     responses:
 *       200:
 *         description: Contract review completed successfully.
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
 *                   example: "Contract review completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "Review processed."
 *                     reviewResults:
 *                       type: object
 *                       description: Detailed results of the contract review.
 *                       properties:
 *                         summary:
 *                           type: string
 *                           example: "The contract outlines a service agreement with standard clauses..."
 *                         issues:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               type:
 *                                 type: string
 *                                 example: "Risk"
 *                               description:
 *                                 type: string
 *                                 example: "The indemnification clause is overly broad and could expose Party A to significant liability."
 *                               severity:
 *                                 type: string
 *                                 example: "High"
 *                         clauses:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Termination"
 *                               analysis:
 *                                 type: string
 *                                 example: "The termination clause allows for termination with 30 days notice by either party without cause."
 *       400:
 *         description: Bad Request. Contract file or contract text is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               MissingContract:
 *                 value:
 *                   statusCode: 400
 *                   success: false
 *                   message: "Contract file or contract text is required"
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               FailedToReview:
 *                 value:
 *                   statusCode: 500
 *                   success: false
 *                   message: "Failed to review contract"
 */
export const reviewContract = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? legalContractReviewService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const reviewParams = req.body;

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

  if (!fileInfo && !reviewParams.contractText) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Contract file or contract text is required',
    });
  }

  logger.info(`Direct contract review request from user ${userId}`, {
    hasFile: !!fileInfo,
    reviewType: reviewParams.reviewType,
  });

  try {
    const result = await legalContractReviewService.reviewContract(
      fileInfo,
      reviewParams,
      userId,
      isGuest
    );

    logger.info('Contract review completed', {
      userId,
      success: result.success,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Contract review completed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in direct contract review:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to review contract',
    });
  }
});

/**
 * @typedef {object} ConversationMessage
 * @property {string} role - The role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The content of the message.
 * @property {string} timestamp - ISO 8601 timestamp of when the message was sent.
 */

/**
 * @typedef {object} ConversationMetadata
 * @property {string} [initialPrompt] - The initial prompt that started the conversation.
 * @property {string} [modelUsed] - The AI model used for the conversation.
 */

/**
 * @typedef {object} ContractsMetadata
 * @property {string} [contractId] - ID of the contract associated with the conversation.
 * @property {string} [contractName] - Name of the contract file.
 * @property {string} [contractSummary] - A brief summary of the contract.
 */

/**
 * @typedef {object} ConversationHistoryData
 * @property {string} conversationId - The unique identifier for the conversation.
 * @property {string} title - A title for the conversation.
 * @property {ConversationMessage[]} messages - An array of messages in the conversation.
 * @property {ConversationMetadata} [metadata] - Additional metadata about the conversation.
 * @property {ContractsMetadata} [contracts_metadata] - Metadata about contracts reviewed in this conversation.
 * @property {string} createdAt - ISO 8601 timestamp of when the conversation was created.
 * @property {string} updatedAt - ISO 8601 timestamp of when the conversation was last updated.
 */

/**
 * Get conversation history
 * @swagger
 * /api/v1/legal-contract-review/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve the full history of a specific legal contract review conversation.
 *     description: This endpoint fetches all messages and metadata for a given conversation ID, accessible only by the authenticated user who owns the conversation.
 *     tags:
 *       - Legal Contract Review
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the conversation to retrieve.
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
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ConversationHistoryData'
 *       404:
 *         description: Conversation not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               NotFound:
 *                 value:
 *                   statusCode: 404
 *                   success: false
 *                   message: "Conversation not found"
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               FailedToFetch:
 *                 value:
 *                   statusCode: 500
 *                   success: false
 *                   message: "Failed to fetch conversation history"
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    // Optimization Recommendation:
    // If 'conversationHelpers.getConversationById' performs a Mongoose query,
    // consider adding '.lean()' to the query to return a plain JavaScript object.
    // This reduces Mongoose document overhead for read-only operations, improving performance.
    // Example: Conversation.findOne({ conversationId, userId }).lean();
    //
    // Indexing Recommendation:
    // For efficient lookup by conversationId and userId, ensure an index exists on your Conversation model.
    // A compound index like `{ conversationId: 1, userId: 1 }` or `{ userId: 1, conversationId: 1 }`
    // would be highly beneficial for this query pattern.
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
        contracts_metadata: conversation.contracts_metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to fetch conversation history',
    });
  }
});

/**
 * @typedef {object} LegalContractReviewController
 * @property {function(Express.Request, Express.Response): Promise<void>} conversationalAssistant - Handles conversational AI requests for contract review.
 * @property {function(Express.Request, Express.Response): Promise<void>} reviewContract - Handles direct, programmatic contract review requests.
 * @property {function(Express.Request, Express.Response): Promise<void>} getConversationHistory - Retrieves the history of a specific conversation.
 */

/**
 * Controller for legal contract review operations.
 * Exposes API endpoints for conversational AI interaction, direct contract review,
 * and retrieving conversation history.
 * @type {LegalContractReviewController}
 */
export const legalContractReviewController = {
  conversationalAssistant,
  reviewContract,
  getConversationHistory,
};