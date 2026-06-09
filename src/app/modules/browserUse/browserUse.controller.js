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
 *     description: Creates a new browser automation session or adds a new task to an existing session based on the provided prompt. Requires user authentication.
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
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     userId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           prompt:
 *                             type: string
 *                           status:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to initiate a new browser automation task or continue an existing session.
 *
 * This function handles the request to start a new browser automation task based on a prompt,
 * or to add a new task to an existing session. It ensures the user is authenticated
 * and validates the presence of a prompt.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the user is not authenticated (401) or if the prompt is missing (400).
 */
const runTaskController = catchAsync(async (req, res) => {
  const { prompt, sessionId, structured_output_json } = req.body;
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // Allowing it from req.body.userId creates an IDOR vulnerability where an attacker
  // could potentially initiate tasks for other users if not properly authenticated.
  const userId = req.user?._id;

  if (!userId) {
    // Ensure the user is authenticated before proceeding.
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
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
    data: result, // Send the whole session object back
  });
});

/**
 * @swagger
 * /api/v1/browser-use/sessions/{sessionId}/tasks/{taskId}/status:
 *   patch:
 *     summary: Update the status of a specific task within a browser automation session.
 *     description: Retrieves and updates the status of a specific task identified by sessionId and taskId. This endpoint is typically used for polling task status or receiving webhook updates. Requires user authentication and authorization to access the specific session/task.
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
 *         description: The ID of the browser automation session.
 *         example: "654321098765432109876543"
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the specific task within the session.
 *         example: "654321098765432109876544"
 *     responses:
 *       200:
 *         description: Task status updated successfully. Returns the updated task details.
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
 *                   example: "Task status updated."
 *                 data:
 *                   type: object
 *                   description: The updated task object.
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876544"
 *                     prompt:
 *                       type: string
 *                       example: "Go to example.com..."
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     output:
 *                       type: object
 *                       nullable: true
 *                       description: The output generated by the task, if any.
 *                     error:
 *                       type: string
 *                       nullable: true
 *                       description: Error message if the task failed.
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to update the status of a specific task within a browser automation session.
 *
 * This function retrieves the `sessionId` and `taskId` from request parameters
 * and uses the authenticated `userId` to authorize and update the task's status.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the user is not authenticated (401).
 */
const getTaskStatusController = catchAsync(async (req, res) => {
  const { sessionId, taskId } = req.params;
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // This userId should be passed to the service layer to ensure the user is authorized
  // to update the status of this specific task/session, preventing IDOR.
  const userId = req.user?._id;

  if (!userId) {
    // Ensure the user is authenticated before proceeding.
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  const result = await BrowserUseServices.updateTaskStatusService(
    userId, // Pass userId to the service for authorization
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
 *     summary: Retrieve all browser automation sessions for the authenticated user.
 *     description: Fetches a list of all browser automation sessions initiated by the currently authenticated user. Requires user authentication.
 *     tags:
 *       - Browser Use
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully.
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
 *                   example: "Sessions retrieved successfully."
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
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       tasks:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                             prompt:
 *                               type: string
 *                             status:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *                             updatedAt:
 *                               type: string
 *                               format: date-time
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
 * Controller to retrieve all browser automation sessions for the authenticated user.
 *
 * This function ensures the user is authenticated and then fetches all sessions
 * associated with their `userId`.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the user is not authenticated (401).
 */
const getUserSessionsController = catchAsync(async (req, res) => {
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // Allowing it from req.params.userId creates an IDOR vulnerability where an attacker
  // could potentially retrieve sessions for other users.
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }
  
  // Optimization Recommendation:
  // For read-only queries like retrieving sessions, consider adding `.lean()`
  // to the Mongoose query in `BrowserUseServices.getSessionsForUserService`.
  // This will return plain JavaScript objects instead of Mongoose documents,
  // reducing overhead if the documents are not modified or saved back.
  //
  // Indexing Recommendation:
  // Ensure that the 'userId' field in the 'BrowserUseSession' model has an index.
  // This is crucial for efficient querying when fetching all sessions for a specific user.
  const result = await BrowserUseServices.getSessionsForUserService(userId, req);
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
 *     summary: Retrieve a specific browser automation session by ID for the authenticated user.
 *     description: Fetches the details of a single browser automation session identified by `sessionId`. Requires user authentication and authorization to access the specific session.
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
 *         description: The ID of the browser automation session to retrieve.
 *         example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Session retrieved successfully.
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
 *                   example: "Session retrieved successfully."
 *                 data:
 *                   type: object
 *                   description: The session object.
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     userId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           prompt:
 *                             type: string
 *                           status:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to retrieve a specific browser automation session by its ID.
 *
 * This function fetches the `sessionId` from request parameters and uses the
 * authenticated `userId` to ensure the user is authorized to view the session.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the user is not authenticated (401).
 */
const getSessionByIdController = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  // Security Fix: userId must always come from the authenticated user (req.user?._id).
  // Allowing it from req.params.userId creates an IDOR vulnerability where an attacker
  // could potentially retrieve sessions for other users.
  const userId = req.user?._id;
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User not authenticated');
  }

  // Optimization Recommendation:
  // For read-only queries like retrieving a single session, consider adding `.lean()`
  // to the Mongoose query in `BrowserUseServices.getSessionByIdService`.
  // This will return a plain JavaScript object instead of a Mongoose document,
  // reducing overhead if the document is not modified or saved back.
  //
  // Indexing Recommendation:
  // Ensure that the 'userId' field in the 'BrowserUseSession' model has an index.
  // This is important for efficient authorization checks when querying by both
  // '_id' and 'userId'.
  const result = await BrowserUseServices.getSessionByIdService(
    sessionId,
    userId, // Pass userId to the service for authorization
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
 * @namespace BrowserUseController
 * @description Provides controller functions for managing browser automation tasks and sessions.
 * These functions handle initiating tasks, retrieving task statuses, and managing user sessions.
 */
export const BrowserUseController = {
  runTaskController,
  getTaskStatusController,
  getUserSessionsController,
  getSessionByIdController,
};