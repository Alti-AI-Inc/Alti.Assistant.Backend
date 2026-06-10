import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { QwenAiServices } from './qwen.service.js';

/**
 * @openapi
 * /api/v1/qwen/response:
 *   post:
 *     summary: Get response from Qwen AI model
 *     description: Processes a user prompt using the Qwen AI service, maintaining session history for multi-tenant or individual user contexts. The user context is derived from the authentication token, not the request body.
 *     tags:
 *       - Qwen AI
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
 *                 description: The input prompt for the AI model.
 *               sessionId:
 *                 type: string
 *                 description: Optional session identifier for tracking conversation history.
 *     responses:
 *       200:
 *         description: Response processed successfully.
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
 *                   example: Response processed successfully.
 *                 data:
 *                   type: object
 *                   description: The generated AI response payload.
 *       400:
 *         description: Invalid request payload or missing parameters.
 *       401:
 *         description: Unauthorized access.
 *       403:
 *         description: Forbidden. User has insufficient permissions or has exceeded usage limits.
 *       500:
 *         description: Internal server error.
 */
/**
 * Controller to handle standard Qwen AI response generation.
 * Validates the incoming request, extracts prompt, userId, and sessionId,
 * invokes the Qwen AI service, and returns the generated response.
 *
 * @async
 * @function QwenAiGetResponse
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is successfully sent.
 */
const QwenAiGetResponse = catchAsync(async (req, res) => {
  // BUGFIX: IDOR & Lack of Context
  // - Removed `userId` from `validatePromptRequest` and request body to prevent IDOR.
  // - The authenticated user's ID and context must be derived from the request object (`req.user`),
  //   which is populated by the authentication middleware.
  const { prompt, sessionId } = await validatePromptRequest(req);
  const user = req.user; // Assumes auth middleware populates req.user with { id, role, workspaceId, etc. }

  // CRITICAL INTEGRATION: Pass the full user context to the service layer.
  // The service layer is responsible for:
  // 1. Verifying the user's role and permissions within their tenant (workspace).
  // 2. Checking if the user or their workspace has exceeded usage limits.
  // 3. Correctly attributing the AI usage to the user and their workspace/tenant.
  // 4. Handling notifications for managers/admins if limits are approached.
  const result = await QwenAiServices.QwenAiGetResponseService(
    prompt,
    user, // Pass the entire user object for full context
    sessionId
  );

  logger.info(`✅ Service result for user ${user.id}:`, result); // log result with user context
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * @openapi
 * /api/v1/qwen/qwq-response:
 *   post:
 *     summary: Get response from Qwen QWQ AI model
 *     description: Processes a user prompt using the specialized Qwen QWQ AI service, maintaining session history for multi-tenant or individual user contexts. The user context is derived from the authentication token, not the request body.
 *     tags:
 *       - Qwen AI
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
 *                 description: The input prompt for the specialized Qwen QWQ AI model.
 *               sessionId:
 *                 type: string
 *                 description: Optional session identifier for tracking conversation history.
 *     responses:
 *       200:
 *         description: Response processed successfully.
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
 *                   example: Response processed successfully.
 *                 data:
 *                   type: object
 *                   description: The generated AI response payload.
 *       400:
 *         description: Invalid request payload or missing parameters.
 *       401:
 *         description: Unauthorized access.
 *       403:
 *         description: Forbidden. User has insufficient permissions or has exceeded usage limits.
 *       500:
 *         description: Internal server error.
 */
/**
 * Controller to handle specialized Qwen QWQ AI response generation.
 * Validates the incoming request, extracts prompt, userId, and sessionId,
 * invokes the Qwen QWQ AI service, and returns the generated response.
 *
 * @async
 * @function QwenQWQAiGetResponse
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is successfully sent.
 */
const QwenQWQAiGetResponse = catchAsync(async (req, res) => {
  // BUGFIX: IDOR & Lack of Context
  // - Removed `userId` from `validatePromptRequest` and request body to prevent IDOR.
  // - The authenticated user's ID and context must be derived from the request object (`req.user`),
  //   which is populated by the authentication middleware.
  const { prompt, sessionId } = await validatePromptRequest(req);
  const user = req.user; // Assumes auth middleware populates req.user with { id, role, workspaceId, etc. }

  // CRITICAL INTEGRATION: Pass the full user context to the service layer.
  // The service layer is responsible for:
  // 1. Verifying the user's role and permissions within their tenant (workspace).
  // 2. Checking if the user or their workspace has exceeded usage limits.
  // 3. Correctly attributing the AI usage to the user and their workspace/tenant.
  // 4. Handling notifications for managers/admins if limits are approached.
  const result = await QwenAiServices.QwenQWQAiGetResponseService(
    prompt,
    user, // Pass the entire user object for full context
    sessionId
  );

  logger.info(`✅ Service result for user ${user.id}:`, result); // log result with user context
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * Controller object containing handlers for Qwen AI operations.
 * Provides endpoints for standard Qwen and specialized Qwen QWQ models.
 *
 * @type {{
 *   QwenAiGetResponse: import('express').RequestHandler,
 *   QwenQWQAiGetResponse: import('express').RequestHandler
 * }}
 */
export const QwenAiController = {
  QwenAiGetResponse,
  QwenQWQAiGetResponse,
};