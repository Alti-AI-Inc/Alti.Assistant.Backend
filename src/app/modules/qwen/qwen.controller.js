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
 *     description: Processes a user prompt using the Qwen AI service, maintaining session history for multi-tenant or individual user contexts.
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
 *               userId:
 *                 type: string
 *                 description: Unique identifier of the user, providing multi-tenant/user isolation.
 *               sessionId:
 *                 type: string
 *                 description: Session identifier for tracking conversation history.
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
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  // Initialize session memory for conversation history
  const result = await QwenAiServices.QwenAiGetResponseService(
    prompt,
    userId,
    sessionId
  );
  // Structured log for GCP Cloud Logging
  logger.info({
    message: 'Qwen AI service call successful.',
    service: 'QwenAiGetResponseService',
    userId,
    sessionId,
    payload: result,
  });
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
 *     description: Processes a user prompt using the specialized Qwen QWQ AI service, maintaining session history for multi-tenant or individual user contexts.
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
 *               userId:
 *                 type: string
 *                 description: Unique identifier of the user, providing multi-tenant/user isolation.
 *               sessionId:
 *                 type: string
 *                 description: Session identifier for tracking conversation history.
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
  const { prompt, userId, sessionId } = await validatePromptRequest(req);
  // Initialize session memory for conversation history
  const result = await QwenAiServices.QwenQWQAiGetResponseService(
    prompt,
    userId,
    sessionId
  );
  // Structured log for GCP Cloud Logging
  logger.info({
    message: 'Qwen QWQ AI service call successful.',
    service: 'QwenQWQAiGetResponseService',
    userId,
    sessionId,
    payload: result,
  });
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