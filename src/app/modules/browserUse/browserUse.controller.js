import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { BrowserUseServices } from './browserUse.service.js';
// Assuming a pre-configured Winston logger is available for GCP structured logging.
import { logger } from '../../../shared/logger.js';

// Define roles for consistent use and clarity
const ROLES = {
  SUPER_ADMIN: 'super_admin',
  PLATFORM_OWNER: 'platform_owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
};

/**
 * @swagger
 * /api/v1/browser-use/task:
 *   post:
 *     summary: Initiate a new browser automation task or continue an existing session.
 *     description: Creates a new browser automation session or adds a new task to an existing session. Requires user authentication. Platform Owners can run tasks on behalf of any user. Admins and Managers can run tasks on behalf of users within their scope (workspace/managed users).
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
 *                 description: "Optional. Target user ID. `super_admin`/`platform_owner` can target any user. `admin`/`manager` can target users within their scope. Ignored for `user` role."
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
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to initiate a new browser automation task or continue an existing session.
 * Supports hierarchical overrides for privileged roles.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const runTaskController = catchAsync(async (req, res) => {
  const { prompt, sessionId, structured_output_json, userId: targetUserId } = req.body;
  const actor = req.user;

  if (!actor?._id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  let effectiveUserId = actor._id;

  // Determine the effective user ID based on the actor's role and if a target user is specified.
  if (targetUserId && targetUserId.toString() !== actor._id.toString()) {
    const { role } = actor;

    if (
      role === ROLES.SUPER_ADMIN ||
      role === ROLES.PLATFORM_OWNER
    ) {
      // Platform owners can target any user.
      effectiveUserId = targetUserId;
    } else if (role === ROLES.ADMIN || role === ROLES.MANAGER) {
      // Admins/Managers can target users within their scope.
      // CRITICAL: The service layer MUST validate this relationship (e.g., same workspace, or direct report) using the actor's context from `req.user`.
      effectiveUserId = targetUserId;
    } else {
      // Regular users cannot run tasks on behalf of others.
      throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to perform this action on behalf of another user.');
    }

    logger.warn({
      message: `${role} override: Running task on behalf of another user.`,
      actor: { id: actor._id, role: actor.role },
      target: { userId: effectiveUserId },
      sessionId: sessionId || 'new_session',
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
  } else {
    logger.info({
      message: 'Initiating browser use task.',
      context: {
        userId: actor._id,
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
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required field: prompt');
  }

  try {
    const result = await BrowserUseServices.initiateTaskInSessionService(
      effectiveUserId,
      sessionId, // This will be null/undefined for a new session
      prompt,
      structured_output_json,
      req // Pass the full request so the service layer can use actor context for validation
    );

    const isGuest = req.isGuest || actor?.isGuest;
    if (!isGuest) {
      try {
        const subscriptionService = (await import('../subscription/subscription.service.js')).default;
        const tenantId = req.user?.tenantId || req.tenantId || null;
        subscriptionService.trackAndIncrementMonthlyUsage(effectiveUserId, tenantId, 'task').catch((err) => {
          logger.error('Failed to increment monthly usage for task:', err);
        });
      } catch (err) {
        logger.error('Failed to increment task usage:', err);
      }
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Task initiated successfully.',
      data: result,
    });
  } catch (error) {
    logger.error({
      message: `Failed to initiate browser task: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        actorId: actor._id,
        effectiveUserId: effectiveUserId,
        sessionId: sessionId || 'new_session',
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
    throw error;
  }
});

/**
 * @swagger
 * /api/v1/browser-use/sessions/{sessionId}/tasks/{taskId}/status:
 *   patch:
 *     summary: Update the status of a specific task within a browser automation session.
 *     description: Retrieves and updates the status of a specific task. Access is hierarchical: Platform Owners can access any task, Admins can access tasks within their workspace, Managers for their managed users, and Users for their own tasks.
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
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to update the status of a specific task within a browser automation session.
 * Supports hierarchical access controls.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getTaskStatusController = catchAsync(async (req, res) => {
  const { sessionId, taskId } = req.params;
  const actor = req.user;

  if (!actor?._id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const { role, _id: userId } = actor;
  const isPlatformOwner = role === ROLES.SUPER_ADMIN || role === ROLES.PLATFORM_OWNER;

  logger.info({
    message: 'Fetching browser task status.',
    context: {
      actorId: userId,
      actorRole: role,
      sessionId: sessionId,
      taskId: taskId,
    },
    httpRequest: {
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      remoteIp: req.ip,
    },
  });

  try {
    // For a platform owner, passing null signals a bypass of ownership checks.
    // For all other roles (admin, manager, user), we pass their own ID.
    // CRITICAL: The service layer is responsible for using the full actor context from `req.user`
    // to determine if an admin or manager has rights to view the resource based on
    // workspace (for admins) or management hierarchy (for managers). A simple `resource.userId === authUserId`
    // check is INSUFFICIENT for these roles and will lead to an authorization failure.
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
    logger.error({
      message: `Failed to get task status: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        actorId: userId,
        actorRole: role,
        sessionId,
        taskId,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
    throw error;
  }
});

/**
 * @swagger
 * /api/v1/browser-use/sessions:
 *   get:
 *     summary: Retrieve browser automation sessions.
 *     description: Fetches sessions based on user role. Platform Owners can retrieve all sessions or filter by user. Admins can retrieve sessions for their workspace. Managers for their managed users. Users can only retrieve their own sessions.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: "Optional user ID filter. `super_admin`/`platform_owner` can target any user. `admin`/`manager` can target users within their scope. Ignored for `user` role."
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to retrieve browser automation sessions with role-based access control.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getUserSessionsController = catchAsync(async (req, res) => {
  const actor = req.user;
  const targetUserId = req.query.userId;

  if (!actor?._id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const { role, _id: actorId, workspaceId } = actor;

  try {
    let result;
    let logContext = { actorId, actorRole: role };

    if (role === ROLES.SUPER_ADMIN || role === ROLES.PLATFORM_OWNER) {
      logContext.targetUserId = targetUserId || 'ALL_USERS';
      logger.info({ message: 'Platform Owner retrieving user sessions.', context: logContext, httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl, remoteIp: req.ip } });
      if (targetUserId) {
        result = await BrowserUseServices.getSessionsForUserService(targetUserId, req);
      } else {
        if (typeof BrowserUseServices.getAllSessionsService !== 'function') {
          throw new ApiError(httpStatus.NOT_IMPLEMENTED, 'Fetching all platform sessions is not supported.');
        }
        result = await BrowserUseServices.getAllSessionsService(req);
      }
    } else if (role === ROLES.ADMIN) {
      logContext.targetUserId = targetUserId || `ALL_WORKSPACE_USERS (workspaceId: ${workspaceId})`;
      logger.info({ message: 'Admin retrieving workspace sessions.', context: logContext, httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl, remoteIp: req.ip } });
      // CRITICAL: The service layer MUST validate that targetUserId (if provided) is in the admin's workspace.
      if (targetUserId) {
        result = await BrowserUseServices.getSessionsForUserService(targetUserId, req);
      } else {
        if (typeof BrowserUseServices.getSessionsForWorkspaceService !== 'function') {
          throw new ApiError(httpStatus.NOT_IMPLEMENTED, 'Fetching all workspace sessions is not supported.');
        }
        result = await BrowserUseServices.getSessionsForWorkspaceService(workspaceId, req);
      }
    } else if (role === ROLES.MANAGER) {
      logContext.targetUserId = targetUserId || 'ALL_MANAGED_USERS';
      logger.info({ message: 'Manager retrieving managed users sessions.', context: logContext, httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl, remoteIp: req.ip } });
      // CRITICAL: The service layer MUST validate the manager-reportee relationship for the targetUserId.
      if (targetUserId) {
        result = await BrowserUseServices.getSessionsForUserService(targetUserId, req);
      } else {
        if (typeof BrowserUseServices.getSessionsForManagedUsersService !== 'function') {
          throw new ApiError(httpStatus.NOT_IMPLEMENTED, 'Fetching sessions for all managed users is not supported.');
        }
        result = await BrowserUseServices.getSessionsForManagedUsersService(actorId, req);
      }
    } else { // 'user' role
      logger.info({ message: 'User retrieving their sessions.', context: logContext, httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl, remoteIp: req.ip } });
      if (targetUserId && targetUserId.toString() !== actorId.toString()) {
        throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to view sessions for another user.');
      }
      result = await BrowserUseServices.getSessionsForUserService(actorId, req);
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Sessions retrieved successfully.',
      data: result,
    });
  } catch (error) {
    logger.error({
      message: `Failed to retrieve user sessions: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: { actorId, actorRole: role, targetUserId },
      httpRequest: { requestMethod: req.method, requestUrl: req.originalUrl, remoteIp: req.ip },
    });
    throw error;
  }
});

/**
 * @swagger
 * /api/v1/browser-use/sessions/{sessionId}:
 *   get:
 *     summary: Retrieve a specific browser automation session by ID.
 *     description: Fetches details of a single session. Access is hierarchical: Platform Owners can access any session, Admins can access sessions within their workspace, Managers for their managed users, and Users for their own sessions.
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
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to retrieve a specific browser automation session by its ID.
 * Supports hierarchical access controls.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getSessionByIdController = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const actor = req.user;

  if (!actor?._id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const { role, _id: userId } = actor;
  const isPlatformOwner = role === ROLES.SUPER_ADMIN || role === ROLES.PLATFORM_OWNER;

  logger.info({
    message: 'Fetching browser session by ID.',
    context: {
      actorId: userId,
      actorRole: role,
      sessionId: sessionId,
    },
    httpRequest: {
      requestMethod: req.method,
      requestUrl: req.originalUrl,
      remoteIp: req.ip,
    },
  });

  try {
    // For a platform owner, passing null signals a bypass of ownership checks.
    // For all other roles (admin, manager, user), we pass their own ID.
    // CRITICAL: The service layer is responsible for using the full actor context from `req.user`
    // to determine if an admin or manager has rights to view the resource based on
    // workspace (for admins) or management hierarchy (for managers). A simple `resource.userId === authUserId`
    // check is INSUFFICIENT for these roles and will lead to an authorization failure.
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
    logger.error({
      message: `Failed to retrieve session by ID: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        actorId: userId,
        actorRole: role,
        sessionId,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
    throw error;
  }
});

/**
 * @swagger
 * /api/v1/browser-use/global-stats:
 *   get:
 *     summary: Retrieve global statistics of all browser automation sessions (Platform Owner only).
 *     description: Fetches global statistics including total tasks, active sessions, and success/failure rates. Requires `super_admin` or `platform_owner` role.
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
  const { role, _id: actorId } = req.user || {};
  const isPlatformOwner = role === ROLES.SUPER_ADMIN || role === ROLES.PLATFORM_OWNER;

  if (!isPlatformOwner) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. Platform Owner privilege required.');
  }

  logger.info({
    message: 'Platform Owner retrieving global browser-use statistics.',
    context: {
      actorId: actorId,
      actorRole: role,
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
      stats = {
        message: "Global stats service not implemented, but access is authorized.",
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
    logger.error({
      message: `Failed to retrieve global stats: ${error.message}`,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error instanceof ApiError && { statusCode: error.statusCode, isOperational: error.isOperational }),
      },
      context: {
        actorId: actorId,
        actorRole: role,
      },
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        remoteIp: req.ip,
      },
    });
    throw error;
  }
});

/**
 * @namespace BrowserUseController
 * @description Provides controller functions for managing browser automation tasks and sessions.
 * These functions handle initiating tasks, retrieving task statuses, and managing user sessions with hierarchical role-based access control.
 */
export const BrowserUseController = {
  runTaskController,
  getTaskStatusController,
  getUserSessionsController,
  getSessionByIdController,
  getGlobalStatsController,
};