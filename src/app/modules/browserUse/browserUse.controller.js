import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { BrowserUseServices } from './browserUse.service.js';

/**
 * @swagger
 * /api/v1/browser-use/task:
 *   post:
 *     summary: Initiate a new browser automation task or continue an existing session.
 *     description: Creates a new browser automation session or adds a new task to an existing session based on the provided prompt. Requires user authentication. Platform Owners can run tasks on behalf of other users/tenants.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
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
 *                 description: The natural language prompt describing the browser automation task.
 *                 example: "Go to example.com, find the search bar, type 'hello world', and press enter."
 *               sessionId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. The ID of an existing session to continue. If not provided, a new session will be created.
 *                 example: "654321098765432109876543"
 *               userId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional. Target user ID (Platform Owner / Super Admin override capability).
 *                 example: "654321098765432109876543"
 *               structured_output_json:
 *                 type: object
 *                 nullable: true
 *                 description: Optional. A JSON object defining the desired structured output format for the task.
 *                 example: { "name": "string", "age": "number" }
 *     responses:
 *       200:
 *         description: Task initiated successfully. Returns the updated session details.
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
 *                   example: "Task initiated successfully."
 *                 data:
 *                   type: object
 *                   description: The session object containing task details.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to initiate a new browser automation task or continue an existing session.
 * Supports Platform Owner overrides to run tasks on behalf of other users/tenants.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const runTaskController = catchAsync(async (req, res) => {
  const { prompt, sessionId, structured_output_json } = req.body;
  const isPlatformOwner = req.user?.role === 'super_admin' || req.user?.role === 'platform_owner';
  
  // Default to authenticated user
  let userId = req.user?._id;

  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  // Platform Owner Override: Allow running tasks on behalf of another user/tenant
  if (isPlatformOwner && req.body.userId) {
    userId = req.body.userId;
  }

  if (!prompt) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required field: prompt'
    );
  }

  const result = await BrowserUseServices.initiateTaskInSessionService(
    userId,
    sessionId, // This will be null/undefined for a new session
    prompt,
    structured_output_json,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Task initiated successfully.',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/browser-use/sessions/{sessionId}/tasks/{taskId}/status:
 *   patch:
 *     summary: Update the status of a specific task within a browser automation session.
 *     description: Retrieves and updates the status of a specific task. Platform Owners can bypass ownership checks.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task status updated successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to update the status of a specific task within a browser automation session.
 * Supports Platform Owner bypass of user ownership checks.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getTaskStatusController = catchAsync(async (req, res) => {
  const { sessionId, taskId } = req.params;
  const isPlatformOwner = req.user?.role === 'super_admin' || req.user?.role === 'platform_owner';
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  // Platform Owner Override: Pass null as userId to bypass ownership validation in the service layer
  const authUserId = isPlatformOwner ? null : userId;

  const result = await BrowserUseServices.updateTaskStatusService(
    authUserId,
    sessionId,
    taskId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Task status updated.`,
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/browser-use/sessions:
 *   get:
 *     summary: Retrieve browser automation sessions.
 *     description: Fetches sessions. Platform Owners can retrieve all sessions globally or filter by a specific user.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID filter (Platform Owner only).
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to retrieve browser automation sessions.
 * Supports global oversight for Platform Owners.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getUserSessionsController = catchAsync(async (req, res) => {
  const isPlatformOwner = req.user?.role === 'super_admin' || req.user?.role === 'platform_owner';
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  let result;
  if (isPlatformOwner) {
    const targetUserId = req.query.userId;
    if (targetUserId) {
      // Platform Owner viewing sessions of a specific user
      result = await BrowserUseServices.getSessionsForUserService(targetUserId, req);
    } else {
      // Platform Owner global oversight: retrieve all sessions across the platform
      if (typeof BrowserUseServices.getAllSessionsService === 'function') {
        result = await BrowserUseServices.getAllSessionsService(req);
      } else {
        // Fallback: pass null to indicate global retrieval if supported by service
        result = await BrowserUseServices.getSessionsForUserService(null, req);
      }
    }
  } else {
    // Regular user: retrieve only their own sessions
    result = await BrowserUseServices.getSessionsForUserService(userId, req);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Sessions retrieved successfully.',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/browser-use/sessions/{sessionId}:
 *   get:
 *     summary: Retrieve a specific browser automation session by ID.
 *     description: Fetches details of a single session. Platform Owners can access any session.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to retrieve a specific browser automation session by its ID.
 * Supports Platform Owner bypass of user ownership checks.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getSessionByIdController = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const isPlatformOwner = req.user?.role === 'super_admin' || req.user?.role === 'platform_owner';
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  // Platform Owner Override: Pass null as userId to bypass ownership validation in the service layer
  const authUserId = isPlatformOwner ? null : userId;

  const result = await BrowserUseServices.getSessionByIdService(
    sessionId,
    authUserId,
    req
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Session retrieved successfully.',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/browser-use/global-stats:
 *   get:
 *     summary: Retrieve global statistics of all browser automation sessions (Platform Owner only).
 *     description: Fetches global statistics including total tasks, active sessions, and success/failure rates.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Global statistics retrieved successfully.
 *       403:
 *         description: Forbidden. Platform Owner privilege required.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller for Platform Owners to retrieve global statistics of all browser automation sessions.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getGlobalStatsController = catchAsync(async (req, res) => {
  const isPlatformOwner = req.user?.role === 'super_admin' || req.user?.role === 'platform_owner';
  if (!isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. Platform Owner privilege required.');
  }

  let stats = {};
  if (typeof BrowserUseServices.getGlobalStatsService === 'function') {
    stats = await BrowserUseServices.getGlobalStatsService(req);
  } else {
    // Fallback/Mock stats if service method is not yet fully implemented
    stats = {
      message: "Global stats service not fully implemented, but access is authorized.",
      timestamp: new Date(),
    };
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Global browser-use statistics retrieved successfully.',
    data: stats,
  });
});

/**
 * @namespace BrowserUseController
 * @description Provides controller functions for managing browser automation tasks and sessions.
 * These functions handle initiating tasks, retrieving task statuses, and managing user sessions.
 */
export const BrowserUseController = {
  runTaskController,
  getTaskStatusController,
  getUserSessionsController,
  getSessionByIdController,
  getGlobalStatsController,
};