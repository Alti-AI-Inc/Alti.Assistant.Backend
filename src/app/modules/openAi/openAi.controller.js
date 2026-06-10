import httpStatus from 'http-status';
import { randomUUID } from 'crypto';
import winston from 'winston';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';

// Create a Winston logger that is compatible with Google Cloud Logging (Stackdriver)
// It outputs structured JSON with a 'severity' property, which Cloud Logging automatically recognizes.
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    // This custom format adds the 'severity' property needed by Google Cloud Logging
    winston.format(info => {
      info.severity = info.level.toUpperCase();
      return info;
    })(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Initialize Vertex AI SDK
const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT || 'placeholder-project',
  location: process.env.GCP_LOCATION || 'us-central1',
});

/**
 * Masks sensitive Personally Identifiable Information (PII) from the input text.
 * @param {string} text - The input text to sanitize.
 * @returns {string} The sanitized text.
 */
const maskPII = (text) => {
  if (!text) return '';
  let sanitized = text;
  // Mask Emails
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  // Mask Phone Numbers
  sanitized = sanitized.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  // Mask SSNs
  sanitized = sanitized.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  // Mask Credit Card Numbers
  sanitized = sanitized.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CREDIT_CARD]');
  return sanitized;
};

// Configure explicit safety settings for Vertex AI
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
];

/**
 * @openapi
 * /openai/gpt4o-mini:
 *   post:
 *     summary: Get response from GPT-4o-mini model (Migrated to Vertex AI Gemini 1.5 Flash)
 *     description: Generates an AI response using the Gemini 1.5 Flash model. Requires authenticated user context.
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
 * Handles requests to get a response from the Gemini 1.5 Flash model.
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
  const modelName = 'gemini-1.5-flash';

  logger.info(`Received request for ${modelName}`, {
    userId,
    sessionId,
    model: modelName,
    component: 'openAi.controller',
  });

  // Mask PII before transmitting data to Vertex AI
  const sanitizedPrompt = maskPII(prompt);

  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model: modelName,
      safetySettings,
    });

    const responseStream = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: sanitizedPrompt }] }],
    });

    if (!responseStream.response.candidates || responseStream.response.candidates.length === 0) {
      logger.warn('Vertex AI response was blocked or empty', {
        userId,
        sessionId,
        model: modelName,
        finishReason: responseStream.response.promptFeedback?.blockReason,
        safetyRatings: responseStream.response.promptFeedback?.safetyRatings,
        component: 'openAi.controller',
      });
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Your prompt was blocked due to safety concerns. Please rephrase your request.',
        data: null,
      });
    }

    const resultText = responseStream.response.candidates[0].content.parts[0].text;

    logger.info(`Successfully processed ${modelName} request`, {
      userId,
      sessionId,
      model: modelName,
      component: 'openAi.controller',
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { text: resultText, sessionId, userId },
    });
  } catch (error) {
    logger.error(`Error calling Vertex AI for ${modelName}`, {
      userId,
      sessionId,
      model: modelName,
      errorMessage: error.message,
      errorStack: error.stack,
      component: 'openAi.controller',
    });
    throw error;
  }
});

/**
 * @openapi
 * /openai/gpt4-nano:
 *   post:
 *     summary: Get response from GPT-4-Nano model (Migrated to Vertex AI Gemini 1.5 Pro)
 *     description: Generates an AI response using the Gemini 1.5 Pro model. Requires authenticated user context.
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
 * Handles requests to get a response from the Gemini 1.5 Pro model.
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
  const modelName = 'gemini-1.5-pro';

  logger.info(`Received request for ${modelName}`, {
    userId,
    sessionId,
    model: modelName,
    component: 'openAi.controller',
  });

  // Mask PII before transmitting data to Vertex AI
  const sanitizedPrompt = maskPII(prompt);

  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model: modelName,
      safetySettings,
    });

    const responseStream = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: sanitizedPrompt }] }],
    });

    if (!responseStream.response.candidates || responseStream.response.candidates.length === 0) {
      logger.warn('Vertex AI response was blocked or empty', {
        userId,
        sessionId,
        model: modelName,
        finishReason: responseStream.response.promptFeedback?.blockReason,
        safetyRatings: responseStream.response.promptFeedback?.safetyRatings,
        component: 'openAi.controller',
      });
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Your prompt was blocked due to safety concerns. Please rephrase your request.',
        data: null,
      });
    }

    const resultText = responseStream.response.candidates[0].content.parts[0].text;

    logger.info(`Successfully processed ${modelName} request`, {
      userId,
      sessionId,
      model: modelName,
      component: 'openAi.controller',
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { text: resultText, sessionId, userId },
    });
  } catch (error) {
    logger.error(`Error calling Vertex AI for ${modelName}`, {
      userId,
      sessionId,
      model: modelName,
      errorMessage: error.message,
      errorStack: error.stack,
      component: 'openAi.controller',
    });
    throw error;
  }
});

/**
 * @openapi
 * /openai/anonymous:
 *   post:
 *     summary: Get response anonymously from Vertex AI
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
 * Handles anonymous requests to get a response from Vertex AI.
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
  if (!prompt) {
    logger.warn('Anonymous request rejected: Prompt is required', {
      component: 'openAi.controller',
      endpoint: '/openai/anonymous',
    });
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required.',
      data: null,
    });
  }

  const sessionId = req.body?.sessionId || randomUUID();
  const modelName = 'gemini-1.5-flash';

  logger.info(`Received anonymous request for ${modelName}`, {
    sessionId,
    model: modelName,
    component: 'openAi.controller',
  });

  // Mask PII before transmitting data to Vertex AI
  const sanitizedPrompt = maskPII(prompt);

  try {
    const generativeModel = vertexAI.getGenerativeModel({
      model: modelName,
      safetySettings,
    });

    const responseStream = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: sanitizedPrompt }] }],
    });

    if (!responseStream.response.candidates || responseStream.response.candidates.length === 0) {
      logger.warn('Vertex AI response was blocked or empty for anonymous user', {
        sessionId,
        model: modelName,
        finishReason: responseStream.response.promptFeedback?.blockReason,
        safetyRatings: responseStream.response.promptFeedback?.safetyRatings,
        component: 'openAi.controller',
      });
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Your prompt was blocked due to safety concerns. Please rephrase your request.',
        data: null,
      });
    }

    const resultText = responseStream.response.candidates[0].content.parts[0].text;

    logger.info(`Successfully processed anonymous ${modelName} request`, {
      sessionId,
      model: modelName,
      component: 'openAi.controller',
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: { text: resultText, sessionId },
    });
  } catch (error) {
    logger.error(`Error calling Vertex AI for anonymous ${modelName}`, {
      sessionId,
      model: modelName,
      errorMessage: error.message,
      errorStack: error.stack,
      component: 'openAi.controller',
    });
    throw error;
  }
});

/**
 * Controller object containing handlers for Vertex AI-related endpoints.
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