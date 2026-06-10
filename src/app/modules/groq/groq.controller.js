import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LlamaAiService } from './groq.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

// Active endpoints — all redirected to Google Gemini via groq.service.js

/**
 * @swagger
 * /api/v1/groq:
 *   post:
 *     summary: Get AI response from Groq (Llama) for an authenticated user.
 *     description: >
 *       Sends a prompt to the Groq AI service (which internally uses Google Gemini)
 *       and retrieves a response. Requires user authentication.
 *       The `userId` and `sessionId` are extracted from the request body after validation.
 *     tags:
 *       - Groq AI
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *               - userId
 *               - sessionId
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt or query for the AI.
 *                 example: "What is the capital of France?"
 *               userId:
 *                 type: string
 *                 description: The ID of the authenticated user.
 *                 example: "654321098765432109876543"
 *               sessionId:
 *                 type: string
 *                 description: The ID of the current chat session.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Response processed successfully.
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
 *                   example: "Response processed successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "Paris is the capital of France."
 *                     sessionId:
 *                       type: string
 *                       description: The session ID used for the interaction.
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                     userId:
 *                       type: string
 *                       description: The user ID associated with the interaction.
 *                       example: "654321098765432109876543"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const GroqAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  logger.info('✅ Request received at /groq:', req.body); // log incoming request
  const result = await LlamaAiService.getAiResponsesGroqService(
    prompt,
    userId,
    sessionId
  );
  // logger.info('✅ Service result:', result); // log result
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/groq/anonymous:
 *   post:
 *     summary: Get AI response from Groq (Llama) anonymously.
 *     description: >
 *       Sends a prompt to the Groq AI service (which internally uses Google Gemini)
 *       and retrieves a response without requiring user authentication.
 *       A new session ID is generated if not provided.
 *     tags:
 *       - Groq AI
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's prompt or query for the AI.
 *                 example: "Tell me a fun fact about space."
 *               sessionId:
 *                 type: string
 *                 description: Optional. The ID of the current chat session. If not provided, a new one will be generated.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Response processed successfully.
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
 *                   example: "Response processed successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated response.
 *                       example: "Did you know that a day on Venus is longer than a year on Venus?"
 *                     sessionId:
 *                       type: string
 *                       description: The session ID used for the interaction.
 *                       example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const GroqAiGetResponseAnonymously = catchAsync(async (req, res) => {
  // Validate prompt input for robustness
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    const error = new Error('Prompt is required and must be a non-empty string.');
    error.statusCode = httpStatus.BAD_REQUEST; // Custom property for catchAsync to use
    throw error;
  }

  const sessionId = req.body?.sessionId || randomUUID(); // Fixed session for anonymous users

  const responseData = await LlamaAiService.GroqAiGetResponseAnonymousService(
    prompt,
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: responseData,
  });
});

/**
 * @swagger
 * /api/v1/groq/user-sessions:
 *   get:
 *     summary: Get all AI chat sessions for the authenticated user.
 *     description: >
 *       Retrieves all AI chat sessions and their responses associated with the authenticated user.
 *       The user ID is extracted from the authentication token.
 *     tags:
 *       - Groq AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Get Response successfully.
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
 *                   example: "Get Response successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       userId:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       sessionId:
 *                         type: string
 *                         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                       prompt:
 *                         type: string
 *                         example: "What is AI?"
 *                       response:
 *                         type: string
 *                         example: "AI stands for Artificial Intelligence..."
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const LlamaAiGetResponseFromDbByUserId = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  // Log userId for debugging purposes, consider using logger.debug in production
  console.log(userId, 'userId from token in controller');

  // Ensure userId is present (should be handled by auth middleware, but good to be explicit)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  const responseData =
    await LlamaAiService.getAiResponsesByUserIdService(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

/**
 * @swagger
 * /api/v1/groq/session/{sessionId}:
 *   get:
 *     summary: Get AI chat responses for a specific session by ID.
 *     description: >
 *       Retrieves all AI chat responses within a specific session, identified by `sessionId`.
 *       Requires user authentication and ensures the session belongs to the authenticated user.
 *     tags:
 *       - Groq AI
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the chat session to retrieve responses from.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Get Response successfully.
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
 *                   example: "Get Response successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       userId:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       sessionId:
 *                         type: string
 *                         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *                       prompt:
 *                         type: string
 *                         example: "What is AI?"
 *                       response:
 *                         type: string
 *                         example: "AI stands for Artificial Intelligence..."
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const LlamaAiGetResponseFromDbBySessionId = catchAsync(async (req, res) => {
  const sessionId = req.params?.sessionId;
  const userId = req.user?._id; // Get userId from authenticated user for ownership check

  // Ensure sessionId is provided
  if (!sessionId) {
    const error = new Error('Session ID is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }

  // Ensure userId is present for authenticated access (prevents IDOR)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  // Pass userId to the service to enforce ownership check and prevent IDOR
  const responseData = await LlamaAiService.getAiResponsesBySession(sessionId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

/**
 * @swagger
 * /api/v1/groq/session/{objectId}:
 *   delete:
 *     summary: Delete a specific AI chat session entry.
 *     description: >
 *       Deletes a single AI chat session entry identified by its `objectId`.
 *       Requires user authentication and ensures the session entry belongs to the authenticated user.
 *     tags:
 *       - Groq AI
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: objectId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique ID of the AI chat session entry to delete.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Session deleted successfully.
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
 *                   example: "Session deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 1
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const deleteOneAiSession = catchAsync(async (req, res) => {
  const objectId = req.params?.objectId; // Renamed 'id' to 'objectId' for clarity
  const userId = req.user?._id; // Get userId from authenticated user for ownership check

  // Ensure objectId is provided
  if (!objectId) {
    const error = new Error('Object ID is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }

  // Ensure userId is present for authenticated access (prevents IDOR)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  // Pass userId to the service to enforce ownership check and prevent IDOR
  const result = await LlamaAiService.deleteOneLlamaAiSession(objectId, userId);
  // logger.info(result, 'resultttt');
  if (!result.success) {
    // If the service indicates failure (e.g., not found or not authorized)
    // it's better to return a more specific status code like NOT_FOUND or FORBIDDEN
    // depending on the reason for failure. Assuming INTERNAL_SERVER_ERROR for generic service failure.
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  // Changed to OK (200) as a body is being sent, which is not standard for NO_CONTENT (204)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result?.message || 'Session deleted successfully', // Provide a default message
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/groq/delete-all-sessions:
 *   delete:
 *     summary: Delete all AI chat sessions for the authenticated user.
 *     description: >
 *       Deletes all AI chat sessions and their associated responses for the authenticated user.
 *       Requires user authentication.
 *     tags:
 *       - Groq AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions deleted successfully.
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
 *                   example: "Delete All Successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 5
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const deleteAllAiSessions = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  // Log userId for debugging purposes, consider using logger.debug in production
  console.log(userId, 'userId from token in controller');

  // Ensure userId is present (should be handled by auth middleware, but good to be explicit)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  const result = await LlamaAiService.deleteAllAiSessionsService(userId);
  // logger.info(result, 'resultttt');

  if (!result.success) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'fail',
      error: result.message,
    });
  }

  // Changed to OK (200) as a body is being sent, which is not standard for NO_CONTENT (204)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Delete All Successfully',
    data: result,
  });
});

/**
 * @typedef {object} LlamaAiController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} GroqAiGetResponse - Controller for getting AI responses for authenticated users.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} GroqAiGetResponseAnonymously - Controller for getting AI responses anonymously.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} LlamaAiGetResponseFromDbByUserId - Controller for retrieving all AI responses for a specific user.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} LlamaAiGetResponseFromDbBySessionId - Controller for retrieving AI responses by session ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteOneAiSession - Controller for deleting a single AI session entry.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} deleteAllAiSessions - Controller for deleting all AI sessions for a user.
 */
export const LlamaAiController = {
  GroqAiGetResponse,
  GroqAiGetResponseAnonymously,
  LlamaAiGetResponseFromDbByUserId,
  LlamaAiGetResponseFromDbBySessionId,
  deleteOneAiSession,
  deleteAllAiSessions,
};