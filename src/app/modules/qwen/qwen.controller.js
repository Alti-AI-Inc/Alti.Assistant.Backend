import httpStatus from 'http-status';
// VERTEX AI & SAFETY GUARD AGENT: Import Vertex AI SDK and safety enums.
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google-cloud/vertexai';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
// VERTEX AI & SAFETY GUARD AGENT: The QwenAiServices is replaced by direct Vertex AI SDK calls.
// import { QwenAiServices } from './qwen.service.js';

import config from '../../../../config/index.js';

// VERTEX AI & SAFETY GUARD AGENT: Initialize Vertex AI client.
// Ensure GCLOUD_PROJECT and GCLOUD_LOCATION are set in your environment variables.
const vertex_ai = new VertexAI({
  project: config.gcp?.projectId || process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || 'alti-assistant',
  location: config.gcp?.location || process.env.GCP_LOCATION || process.env.GCLOUD_LOCATION || 'us-central1',
});

// VERTEX AI & SAFETY GUARD AGENT: Define safety settings to block harmful content.
// These settings are applied to all model generation requests.
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// VERTEX AI & SAFETY GUARD AGENT: Instantiate the models to be used.
const generalModel = vertex_ai.getGenerativeModel({
  model: 'gemini-1.5-flash-001',
  safetySettings,
});

const specializedModel = vertex_ai.getGenerativeModel({
  model: 'gemini-1.5-flash-001',
  safetySettings,
  // Example of a system instruction for a specialized model.
  systemInstruction: {
    parts: [
      {
        text: 'You are a helpful code generation assistant. You only respond with valid, well-formatted code in the requested language. Do not provide explanations or conversational text.',
      },
    ],
  },
});

// VERTEX AI & SAFETY GUARD AGENT: A simple PII masking function.
// In a production environment, use a robust solution like the Google Cloud DLP API
// for comprehensive PII detection and de-identification.
const maskPii = text => {
  if (!text) return '';
  // Masks common email formats.
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  // Masks common North American phone number formats.
  const phoneRegex = /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  // Masks U.S. Social Security Numbers.
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;

  return text
    .replace(emailRegex, '[EMAIL_REDACTED]')
    .replace(phoneRegex, '[PHONE_REDACTED]')
    .replace(ssnRegex, '[SSN_REDACTED]');
};

// VERTEX AI & SAFETY GUARD AGENT: In-memory store for chat sessions.
// Replace with a persistent, scalable store like Redis or a database in production.
const chatSessions = new Map();

/**
 * @openapi
 * /api/v1/vertexai/response:
 *   post:
 *     summary: Get response from Google's Gemini model via Vertex AI
 *     description: Processes a user prompt using the Vertex AI SDK, maintaining session history. It automatically masks PII from the prompt and applies Google's safety filters to both the input and output. The user context is derived from the authentication token.
 *     tags:
 *       - Vertex AI
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
 *                 description: The input prompt for the AI model. PII will be automatically masked.
 *               sessionId:
 *                 type: string
 *                 description: Optional session identifier for tracking conversation history. If not provided, a new conversation is started.
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
 *         description: Internal server error or issue with the AI service.
 */
/**
 * Controller to handle standard Vertex AI response generation.
 * Validates the request, masks PII in the prompt, manages chat history,
 * invokes the Vertex AI Gemini model with enterprise safety settings,
 * and returns the generated response.
 *
 * @async
 * @function VertexAiGetResponse
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is successfully sent.
 */
const VertexAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, sessionId } = await validatePromptRequest(req);
  const user = req.user; // Assumes auth middleware populates req.user

  // VERTEX AI & SAFETY GUARD AGENT: Filter PII before sending data to the model.
  const maskedPrompt = maskPii(prompt);

  // VERTEX AI & SAFETY GUARD AGENT: Manage chat session history.
  // A new chat is started if no sessionId is provided or found.
  const chat =
    sessionId && chatSessions.has(sessionId)
      ? chatSessions.get(sessionId)
      : generalModel.startChat({});

  if (sessionId && !chatSessions.has(sessionId)) {
    chatSessions.set(sessionId, chat);
  }

  // VERTEX AI & SAFETY GUARD AGENT: Call the model with the sanitized prompt.
  // The safety settings were already configured during model initialization.
  const result = await chat.sendMessage(maskedPrompt);
  const response = result.response;
  const responseText = response.candidates[0].content.parts[0].text;

  logger.info(`✅ Vertex AI response for user ${user.id}:`, responseText);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: { response: responseText },
  });
});

/**
 * @openapi
 * /api/v1/vertexai/specialized-response:
 *   post:
 *     summary: Get response from a specialized Gemini model via Vertex AI
 *     description: Processes a user prompt using a specialized Vertex AI model (e.g., for code generation), maintaining session history. It automatically masks PII and applies Google's safety filters. The user context is derived from the authentication token.
 *     tags:
 *       - Vertex AI
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
 *                 description: The input prompt for the specialized AI model. PII will be automatically masked.
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
 *         description: Internal server error or issue with the AI service.
 */
/**
 * Controller to handle specialized Vertex AI response generation.
 * Uses a model configured with a specific system instruction.
 * Validates the request, masks PII, manages chat history,
 * invokes the specialized Vertex AI model with safety settings,
 * and returns the generated response.
 *
 * @async
 * @function VertexAiSpecializedGetResponse
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @returns {Promise<void>} Resolves when the response is successfully sent.
 */
const VertexAiSpecializedGetResponse = catchAsync(async (req, res) => {
  const { prompt, sessionId } = await validatePromptRequest(req);
  const user = req.user; // Assumes auth middleware populates req.user

  // VERTEX AI & SAFETY GUARD AGENT: Filter PII before sending data to the model.
  const maskedPrompt = maskPii(prompt);

  // VERTEX AI & SAFETY GUARD AGENT: Manage chat session history for the specialized model.
  const specializedSessionId = sessionId ? `specialized-${sessionId}` : null;
  const chat =
    specializedSessionId && chatSessions.has(specializedSessionId)
      ? chatSessions.get(specializedSessionId)
      : specializedModel.startChat({});

  if (specializedSessionId && !chatSessions.has(specializedSessionId)) {
    chatSessions.set(specializedSessionId, chat);
  }

  // VERTEX AI & SAFETY GUARD AGENT: Call the model with the sanitized prompt.
  // Safety settings and system instructions were configured during model initialization.
  const result = await chat.sendMessage(maskedPrompt);
  const response = result.response;
  const responseText = response.candidates[0].content.parts[0].text;

  logger.info(
    `✅ Specialized Vertex AI response for user ${user.id}:`,
    responseText
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: { response: responseText },
  });
});

/**
 * Controller object containing handlers for Vertex AI operations.
 * Provides endpoints for standard and specialized generative models.
 *
 * @type {{
 *   VertexAiGetResponse: import('express').RequestHandler,
 *   VertexAiSpecializedGetResponse: import('express').RequestHandler
 * }}
 */
export const VertexAiController = {
  VertexAiGetResponse,
  VertexAiSpecializedGetResponse,
};

export const QwenAiController = {
  QwenAiGetResponse: VertexAiGetResponse,
  QwenQWQAiGetResponse: VertexAiSpecializedGetResponse,
};