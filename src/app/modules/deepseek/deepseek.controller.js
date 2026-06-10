import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { deepseekServices } from './deepseek.service.js';

/**
 * @swagger
 * /api/v1/deepseek/response:
 *   post:
 *     summary: Get a response from the Deepseek AI model.
 *     description: Processes a user prompt using the Deepseek AI service and returns the AI's response.
 *     tags:
 *       - Deepseek AI
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
 *                 description: The user's input prompt for the AI.
 *                 example: "What is the capital of France?"
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the user making the request.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the current conversation session.
 *                 example: "f1e2d3c4-b5a6-0987-6543-210fedcba987"
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
 *                   description: The AI's response data.
 *                   properties:
 *                     response:
 *                       type: string
 *                       description: The AI's generated text response.
 *                       example: "The capital of France is Paris."
 *                     // Add other potential fields from deepseekResponseService result if known
 *       400:
 *         description: Bad Request. Invalid prompt, userId, or sessionId.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * Handles the request to get a response from the Deepseek AI model.
 *
 * This function extracts `prompt`, `userId`, and `sessionId` from the request body
 * using `validatePromptRequest`, then calls the Deepseek AI service to get a response.
 * Finally, it sends a success response with the AI's output.
 *
 * @param {import('express').Request} req - The Express request object, containing the prompt, userId, and sessionId in its body.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response has been sent.
 */
const DeepseekAiGetResponse = catchAsync(async (req, res) => {
  // Validate the request body parameters (prompt, userId, sessionId).
  // This ensures the incoming data adheres to expected formats and presence.
  // The `userId` from the body is extracted as `_bodyUserId` but will be overridden for security.
  const { prompt, userId: _bodyUserId, sessionId } = await validatePromptRequest(req);

  // Security Fix: Prevent Insecure Direct Object Reference (IDOR).
  // The `userId` for the service call should come from the authenticated user's context (e.g., req.user.id)
  // rather than directly from the request body. This ensures that a user cannot
  // impersonate another user by simply changing the `userId` in the request.
  // It is assumed that an authentication middleware has populated `req.user` with the authenticated user's details.
  const authenticatedUserId = req.user?.id;

  // If authentication is expected but the authenticated user ID is missing,
  // it indicates an unauthorized access attempt or a misconfiguration in the authentication flow.
  if (!authenticatedUserId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Authentication required or authenticated user ID missing.',
    });
  }

  const result = await deepseekServices.deepseekResponseService(
    prompt,
    authenticatedUserId, // Use the authenticated user's ID for the service call
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * @namespace DeepseekAiController
 * @description Controller for handling Deepseek AI related operations.
 * This object groups all Deepseek AI endpoint handlers.
 */
export const DeepseekAiController = {
  DeepseekAiGetResponse,
};