import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// import { ConversationChain } from 'langchain/chains';
import { GeminiAiService } from './gemini.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

/**
 * @swagger
 * /api/v1/gemini/get-response:
 *   post:
 *     summary: Get a response from the Gemini AI model.
 *     description: Processes a user prompt using the Gemini AI service, managing session and user context.
 *     tags:
 *       - Gemini AI
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
 *                 description: The user's input prompt for the AI.
 *                 example: "What is the capital of France?"
 *               userId:
 *                 type: string
 *                 description: Optional ID of the user making the request, for context.
 *                 example: "user123"
 *               sessionId:
 *                 type: string
 *                 description: Optional ID of the current conversation session, for continuity.
 *                 example: "session456"
 *     responses:
 *       200:
 *         description: Successful response from the Gemini AI.
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
 *                       example: "The capital of France is Paris."
 *       400:
 *         description: Bad Request - Validation failed or invalid input.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation failed: Prompt is required."
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   example: null
 */
const GeminiAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  // If validation failed, immediately send the error response and stop further processing.
  if (errorResponse) {
    return sendResponse(res, {
      statusCode: errorResponse.statusCode || httpStatus.BAD_REQUEST, // Use status from errorResponse or default to BAD_REQUEST
      success: false,
      message: errorResponse.message || 'Validation failed.',
      data: null, // No data on error
    });
  }

  const result = await GeminiAiService.geminiService(sessionId, prompt, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/gemini/25-preview/get-response:
 *   post:
 *     summary: Get a response from the Gemini 2.5 Preview AI model.
 *     description: Processes a user prompt using the Gemini 2.5 Preview AI service, managing session and user context.
 *     tags:
 *       - Gemini AI
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
 *                 description: The user's input prompt for the AI.
 *                 example: "Tell me a story about a brave knight."
 *               userId:
 *                 type: string
 *                 description: Optional ID of the user making the request, for context.
 *                 example: "user123"
 *               sessionId:
 *                 type: string
 *                 description: Optional ID of the current conversation session, for continuity.
 *                 example: "session456"
 *     responses:
 *       200:
 *         description: Successful response from the Gemini 2.5 Preview AI.
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
 *                       example: "Once upon a time..."
 *       400:
 *         description: Bad Request - Validation failed or invalid input.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation failed: Prompt is required."
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   example: null
 */
const Gemini25PreviewAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  // If validation failed, immediately send the error response and stop further processing.
  if (errorResponse) {
    return sendResponse(res, {
      statusCode: errorResponse.statusCode || httpStatus.BAD_REQUEST, // Use status from errorResponse or default to BAD_REQUEST
      success: false,
      message: errorResponse.message || 'Validation failed.',
      data: null, // No data on error
    });
  }

  const result = await GeminiAiService.gemini25PreviewService(
    sessionId,
    prompt,
    userId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * @typedef {object} GeminiAiController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} GeminiAiGetResponse - Controller for getting a response from the standard Gemini AI model.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} Gemini25PreviewAiGetResponse - Controller for getting a response from the Gemini 2.5 Preview AI model.
 */
/**
 * Controller object for handling Gemini AI related requests.
 * Exposes methods for interacting with different Gemini AI models.
 * @type {GeminiAiController}
 */
export const GeminiAiController = {
  GeminiAiGetResponse,
  Gemini25PreviewAiGetResponse,
};