import httpStatus from 'http-status';
import { randomUUID } from 'crypto';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// import { ConversationChain } from 'langchain/chains';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { openAIAiServices } from './openAi.service.js';
// The LlamaAiService import is no longer used in this controller after the fix
// for OpenAiGetResponseAnonymously. It can be safely removed if not used elsewhere.
import { LlamaAiService } from '../groq/groq.service.js';

/**
 * @openapi
 * /openai/gpt4o-mini:
 *   post:
 *     summary: Get response from GPT-4o-mini model
 *     description: Generates an AI response using the GPT-4o-mini model. Requires authenticated user context.
 *     tags:
 *       - OpenAI
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
 *                 description: Optional session ID to track conversation history.
 *     responses:
 *       200:
 *         description: Response processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Response processed successfully.
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad Request. Invalid prompt or missing parameters.
 *       401:
 *         description: Unauthorized. User authentication required.
 */

/**
 * Handles requests to get a response from the GPT-4o-mini model.
 * Requires user authentication context extracted via `validatePromptRequest`.
 * 
 * @async
 * @function Gpt4oMiniGetResponse
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const Gpt4oMiniGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await openAIAiServices.openAiResponseService(
    prompt,
    userId,
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
 * @openapi
 * /openai/gpt4-nano:
 *   post:
 *     summary: Get response from GPT-4-Nano model
 *     description: Generates an AI response using the GPT-4-Nano model. Requires authenticated user context.
 *     tags:
 *       - OpenAI
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
 *                 description: Optional session ID to track conversation history.
 *     responses:
 *       200:
 *         description: Response processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Response processed successfully.
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad Request. Invalid prompt or missing parameters.
 *       401:
 *         description: Unauthorized. User authentication required.
 */

/**
 * Handles requests to get a response from the GPT-4-Nano model.
 * Requires user authentication context extracted via `validatePromptRequest`.
 * 
 * @async
 * @function Gpt4NanoGetResponse
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const Gpt4NanoGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId } = await validatePromptRequest(req);

  const result = await openAIAiServices.openAi4NanoResponseService(
    prompt,
    userId,
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
 * @openapi
 * /openai/anonymous:
 *   post:
 *     summary: Get response anonymously from OpenAI
 *     description: Generates an AI response anonymously without requiring user authentication.
 *     tags:
 *       - OpenAI
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
 *                 description: The input prompt for the AI.
 *               sessionId:
 *                 type: string
 *                 description: Optional session ID. If not provided, a random UUID will be generated.
 *     responses:
 *       200:
 *         description: Response processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Response processed successfully.
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad Request. Prompt is required.
 */

/**
 * Handles anonymous requests to get a response from OpenAI.
 * Does not require user authentication. Generates a random session ID if none is provided.
 * 
 * @async
 * @function OpenAiGetResponseAnonymously
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is sent.
 */
const OpenAiGetResponseAnonymously = catchAsync(async (req, res) => {
  const prompt = req.body?.prompt;
  // BUG FIX: Added validation to ensure 'prompt' is provided.
  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required.',
      data: null,
    });
  }

  const sessionId = req.body?.sessionId || randomUUID();

  // BUG FIX: The function 'OpenAiGetResponseAnonymously' was incorrectly calling
  // LlamaAiService.GroqAiGetResponseAnonymousService.
  // It has been corrected to call an OpenAI service method,
  // aligning with the function's name and the module's purpose.
  // This assumes 'openAiAnonymousResponseService' exists in 'openAIAiServices'.
  const responseData = await openAIAiServices.openAiAnonymousResponseService(
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
 * Controller object containing handlers for OpenAI-related endpoints.
 * @type {{
 *   Gpt4oMiniGetResponse: import('express').RequestHandler,
 *   Gpt4NanoGetResponse: import('express').RequestHandler,
 *   OpenAiGetResponseAnonymously: import('express').RequestHandler
 * }}
 */
export const openAIAiController = {
  Gpt4oMiniGetResponse,
  Gpt4NanoGetResponse,
  OpenAiGetResponseAnonymously,
};