/**
 * @file Groq AI Controller
 * @module modules/groq/groq.controller
 * @description This file contains the Express controller functions for handling all AI-related interactions
 * with the Groq service (which internally uses Google Gemini). It includes endpoints for authenticated
 * and anonymous chat, session management, and Platform Owner/Super Admin features for global oversight.
 * All controller functions are wrapped with an async error handler (`catchAsync`).
 */

import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LlamaAiService } from './groq.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

// Active endpoints — all redirected to Google Gemini via groq.service.js

// =================================================================================================
// == USER-FACING FEATURES
// =================================================================================================

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
/**
 * Controller to handle AI prompt requests from authenticated users.
 * It validates the incoming request, calls the underlying AI service with the user's prompt,
 * user ID, and session ID, and then sends the AI-generated response back to the client.
 * @param {import('express').Request} req - The Express request object, containing the prompt, userId, and sessionId in the body.
 * @param {import('express').Response} res - The Express response object used to send the response.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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
/**
 * Controller to handle AI prompt requests from anonymous users.
 * It validates the prompt, generates a new session ID if one is not provided,
 * calls the underlying AI service, and sends the response back to the client.
 * @param {import('express').Request} req - The Express request object, containing the prompt and an optional sessionId in the body.
 * @param {import('express').Response} res - The Express response object used to send the response.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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
/**
 * Controller to retrieve all AI chat sessions for the currently authenticated user.
 * It extracts the user ID from the request object (populated by authentication middleware),
 * fetches all associated sessions from the database via the service layer, and returns them.
 * @param {import('express').Request} req - The Express request object. Expects `req.user._id` to be populated by auth middleware.
 * @param {import('express').Response} res - The Express response object used to send the response.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const LlamaAiGetResponseFromDbByUserId = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  // Using logger.debug for internal debugging information, which is more appropriate than console.log
  logger.debug('User ID from token in controller:', userId);

  // Ensure userId is present (should be handled by auth middleware, but good to be explicit)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  // Optimization recommendation: In LlamaAiService.getAiResponsesByUserIdService,
  // consider adding .lean() to Mongoose queries if only plain JavaScript objects are needed
  // and Mongoose document methods/virtuals are not used.
  // Also, ensure an index exists on 'userId' in the database schema for efficient lookup.
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
/**
 * Controller to retrieve all messages within a specific chat session.
 * It requires both a session ID from the URL parameters and a user ID from the authenticated user's token.
 * This ensures that a user can only access their own chat sessions.
 * @param {import('express').Request} req - The Express request object, containing sessionId in params. Expects `req.user._id` to be populated by auth middleware.
 * @param {import('express').Response} res - The Express response object used to send the response.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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

  // Optimization recommendation: In LlamaAiService.getAiResponsesBySession,
  // consider adding .lean() to Mongoose queries if only plain JavaScript objects are needed.
  // Also, ensure a compound index exists on '{ sessionId: 1, userId: 1 }'
  // or at least on 'sessionId' and 'userId' individually in the database schema
  // for efficient lookup and ownership checks.
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
/**
 * Controller to delete a single AI chat entry by its unique object ID.
 * It performs an ownership check using the authenticated user's ID to ensure the user is authorized to delete the entry.
 * @param {import('express').Request} req - The Express request object, containing the objectId in params. Expects `req.user._id` to be populated by auth middleware.
 * @param {import('express').Response} res - The Express response object used to send the response.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
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

  // Optimization recommendation: Ensure an index exists on '{ _id: 1, userId: 1 }'
  // in the database schema for efficient deletion with ownership check.
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
/**
 * Controller to delete all AI chat sessions associated with the authenticated user.
 * This is a bulk delete operation scoped to the user ID from the authentication token.
 * @param {import('express').Request} req - The Express request object. Expects `req.user._id` to be populated by auth middleware.
 * @param {import('express').Response} res - The Express response object used to send the response.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const deleteAllAiSessions = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  // Using logger.debug for internal debugging information, which is more appropriate than console.log
  logger.debug('User ID from token in controller:', userId);

  // Ensure userId is present (should be handled by auth middleware, but good to be explicit)
  if (!userId) {
    const error = new Error('User ID is required for this operation.');
    error.statusCode = httpStatus.UNAUTHORIZED;
    throw error;
  }

  // Optimization recommendation: Ensure an index exists on 'userId' in the database schema
  // for efficient bulk deletion.
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


// =================================================================================================
// == PLATFORM OWNER / SUPER ADMIN FEATURES
// =================================================================================================

/**
 * @swagger
 * /api/v1/groq/admin/stats:
 *   get:
 *     summary: (Admin) Get global platform-wide AI usage statistics.
 *     description: >
 *       Retrieves aggregated statistics for the entire platform, such as total prompts,
 *       number of active users, and total sessions. Requires Super Admin privileges.
 *     tags:
 *       - Groq AI (Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Global statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalPrompts:
 *                   type: integer
 *                   example: 10523
 *                 uniqueUsers:
 *                   type: integer
 *                   example: 450
 *                 totalSessions:
 *                   type: integer
 *                   example: 1200
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const adminGetPlatformStats = catchAsync(async (req, res) => {
  // This endpoint assumes an auth middleware has verified the user is a 'super_admin'.
  const stats = await LlamaAiService.getPlatformWideStats();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform statistics retrieved successfully.',
    data: stats,
  });
});

/**
 * @swagger
 * /api/v1/groq/admin/sessions/user/{userId}:
 *   get:
 *     summary: (Admin) Get all AI chat sessions for a specific user.
 *     description: >
 *       Retrieves all AI chat sessions for a specific user, identified by their `userId`.
 *       This provides global oversight into tenant activity. Requires Super Admin privileges.
 *     tags:
 *       - Groq AI (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user (tenant) whose sessions are to be retrieved.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Sessions for the specified user retrieved successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const adminGetSessionsByUserId = catchAsync(async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    const error = new Error('User ID parameter is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }
  // Re-uses the existing service, but called in an admin context.
  const sessions = await LlamaAiService.getAiResponsesByUserIdService(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Sessions for user ${userId} retrieved successfully.`,
    data: sessions,
  });
});

/**
 * @swagger
 * /api/v1/groq/admin/sessions/user/{userId}:
 *   delete:
 *     summary: (Admin) Delete all AI chat sessions for a specific user.
 *     description: >
 *       Deletes all AI chat sessions for a specific user, identified by their `userId`.
 *       This is a destructive tenant management action. Requires Super Admin privileges.
 *     tags:
 *       - Groq AI (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user (tenant) whose sessions are to be deleted.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: All sessions for the specified user deleted successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const adminDeleteAllUserSessions = catchAsync(async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    const error = new Error('User ID parameter is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }
  // Re-uses the existing service for a targeted bulk delete.
  const result = await LlamaAiService.deleteAllAiSessionsService(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `All sessions for user ${userId} deleted successfully.`,
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/groq/admin/session/{objectId}:
 *   delete:
 *     summary: (Admin) Delete a specific AI chat session entry by its ID.
 *     description: >
 *       Deletes a single AI chat session entry identified by its `objectId`, regardless of owner.
 *       Requires Super Admin privileges for precise content moderation or management.
 *     tags:
 *       - Groq AI (Admin)
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
 *         description: Session deleted successfully by admin.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const adminDeleteOneAiSession = catchAsync(async (req, res) => {
  const { objectId } = req.params;
  if (!objectId) {
    const error = new Error('Object ID parameter is required.');
    error.statusCode = httpStatus.BAD_REQUEST;
    throw error;
  }
  // Assumes a new service method that does NOT check for userId ownership.
  const result = await LlamaAiService.adminDeleteOneLlamaAiSessionById(objectId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Session deleted successfully by admin.',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/groq/admin/config:
 *   get:
 *     summary: (Admin) Get the current system-wide AI configuration.
 *     description: >
 *       Retrieves the current global configuration for the AI service, such as enabled models,
 *       global rate limits, and feature flags. Requires Super Admin privileges.
 *     tags:
 *       - Groq AI (Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System configuration retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *   put:
 *     summary: (Admin) Update the system-wide AI configuration.
 *     description: >
 *       Updates the global configuration for the AI service. Allows overriding tenant limits,
 *       enabling/disabling models, and setting other platform-wide parameters.
 *       Requires Super Admin privileges.
 *     tags:
 *       - Groq AI (Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultModel:
 *                 type: string
 *                 description: The default AI model for all tenants.
 *                 example: "llama3-70b-8192"
 *               globalRequestLimitPerUser:
 *                 type: number
 *                 description: A global limit on requests per user per day. Set to 0 for unlimited.
 *                 example: 100
 *               isAnonymousChatEnabled:
 *                 type: boolean
 *                 description: System-wide toggle for the anonymous chat feature.
 *                 example: false
 *     responses:
 *       200:
 *         description: System configuration updated successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const adminGetSystemConfig = catchAsync(async (req, res) => {
  const config = await LlamaAiService.getSystemConfig();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration retrieved successfully.',
    data: config,
  });
});

const adminUpdateSystemConfig = catchAsync(async (req, res) => {
  const configUpdates = req.body;
  const updatedConfig = await LlamaAiService.updateSystemConfig(configUpdates);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration updated successfully.',
    data: updatedConfig,
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
 * @property {function(import('express').Request, import('express').Response): Promise<void>} adminGetPlatformStats - (Admin) Controller for getting global platform statistics.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} adminGetSessionsByUserId - (Admin) Controller for retrieving all sessions for a specific user.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} adminDeleteAllUserSessions - (Admin) Controller for deleting all sessions for a specific user.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} adminDeleteOneAiSession - (Admin) Controller for deleting any single session by its ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} adminGetSystemConfig - (Admin) Controller for retrieving system-wide AI configuration.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} adminUpdateSystemConfig - (Admin) Controller for updating system-wide AI configuration.
 */
export const LlamaAiController = {
  // User-facing
  GroqAiGetResponse,
  GroqAiGetResponseAnonymously,
  LlamaAiGetResponseFromDbByUserId,
  LlamaAiGetResponseFromDbBySessionId,
  deleteOneAiSession,
  deleteAllAiSessions,

  // Platform Owner / Super Admin
  adminGetPlatformStats,
  adminGetSessionsByUserId,
  adminDeleteAllUserSessions,
  adminDeleteOneAiSession,
  adminGetSystemConfig,
  adminUpdateSystemConfig,
};