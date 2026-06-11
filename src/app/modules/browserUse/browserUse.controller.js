import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { BrowserUseServices } from './browserUse.service.js';
// Assuming a pre-configured Winston logger is available for GCP structured logging.
import { logger } from '../../../shared/logger.js';

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
    const originalUserId = req.user?._id;
    userId = req.body.userId;
    // Security-sensitive actions like impersonation should be logged with higher severity.
    // A properly configured Winston logger will map 'warn' to the 'WARNING' severity level in GCP.
    logger.warn({
      message: 'Platform Owner override: Running task on behalf of another user.',
      actor: { id: originalUserId, role: req.user?.role },
      target: { userId: userId },
      sessionId: sessionId || 'new_session',
      httpRequest: { // This structure helps Cloud Logging associate the log with the request
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
  } else {
    // Standard operational log.
    // A properly configured Winston logger will map 'info' to the 'INFO' severity level in GCP.
    logger.info({
      message: 'Initiating browser use task.',
      context: {
        userId: userId,
        sessionId: sessionId || 'new_session',
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
  }

  if (!prompt) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required field: prompt'
    );
  }

  try {
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
  } catch (error) {
    // Log the detailed error for internal analysis, ensuring it's structured for GCP.
    logger.error({
      message: `Failed to initiate browser task: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        userId: userId,
        sessionId: sessionId || 'new_session',
        isPlatformOwner,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });

    // Re-throw the error to be handled by the global error handler (via catchAsync)
    // which will normalize it and send the appropriate HTTP response.
    throw error;
  }
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

  // GCP-compatible structured log. The severity 'INFO' is added by the logger configuration.
  logger.info({
    message: 'Fetching browser task status.',
    context: {
      authenticatedUserId: userId,
      sessionId: sessionId,
      taskId: taskId,
      isPlatformOwnerBypass: isPlatformOwner,
    },
    httpRequest: {
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      remoteIp: req.ip,
    },
  });

  try {
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
  } catch (error) {
    // Log the detailed error for internal analysis.
    logger.error({
      message: `Failed to get task status: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        authenticatedUserId: userId,
        sessionId,
        taskId,
        isPlatformOwner,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });

    // Allow the global error handler to format the final response.
    throw error;
  }
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

  try {
    let result;
    if (isPlatformOwner) {
      const targetUserId = req.query.userId;
      // GCP-compatible structured log for privileged access.
      logger.info({
        message: 'Platform Owner retrieving user sessions.',
        context: {
          actorId: userId,
          targetUserId: targetUserId || 'ALL_USERS', // Log if fetching for a specific user or all
        },
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.originalUrl,
          remoteIp: req.ip,
        },
      });
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
      // GCP-compatible structured log for standard access.
      logger.info({
        message: 'User retrieving their sessions.',
        context: {
          userId: userId,
        },
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.originalUrl,
          remoteIp: req.ip,
        },
      });
      // Regular user: retrieve only their own sessions
      result = await BrowserUseServices.getSessionsForUserService(userId, req);
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Sessions retrieved successfully.',
      data: result,
    });
  } catch (error) {
    // Log the detailed error for internal analysis.
    logger.error({
      message: `Failed to retrieve user sessions: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        authenticatedUserId: userId,
        targetUserId: req.query.userId,
        isPlatformOwner,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });

    // Allow the global error handler to format the final response.
    throw error;
  }
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

  // GCP-compatible structured log.
  logger.info({
    message: 'Fetching browser session by ID.',
    context: {
      authenticatedUserId: userId,
      sessionId: sessionId,
      isPlatformOwnerBypass: isPlatformOwner,
    },
    httpRequest: {
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      remoteIp: req.ip,
    },
  });

  try {
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
  } catch (error) {
    // Log the detailed error for internal analysis.
    logger.error({
      message: `Failed to retrieve session by ID: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        authenticatedUserId: userId,
        sessionId,
        isPlatformOwner,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });

    // Allow the global error handler to format the final response.
    throw error;
  }
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

  // GCP-compatible structured log for privileged endpoint access.
  logger.info({
    message: 'Platform Owner retrieving global browser-use statistics.',
    context: {
      actorId: req.user?._id,
      actorRole: req.user?.role,
    },
    httpRequest: {
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      remoteIp: req.ip,
    },
  });

  try {
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
  } catch (error) {
    // Log the detailed error for internal analysis.
    logger.error({
      message: `Failed to retrieve global stats: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        actorId: req.user?._id,
        actorRole: req.user?.role,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });

    // Allow the global error handler to format the final response.
    throw error;
  }
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