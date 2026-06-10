import httpStatus from 'http-status';
import { randomUUID } from 'crypto';
import winston from 'winston';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
// FIX: Import services for business logic, authorization, and usage tracking.
import { UsageService } from '../../services/usage.service.js'; // Assumed path
import { WorkspaceService } from '../../services/workspace.service.js'; // Assumed path
import ApiError from '../../../errors/ApiError.js'; // Assumed path for a custom error class

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
 * FIX: Centralized handler for authenticated AI prompt requests.
 * This function encapsulates the core logic for:
 * 1. Validating user and workspace context.
 * 2. Checking usage limits against user and workspace/tenant quotas.
 * 3. Calling the AI model.
 * 4. Recording usage data to propagate it up the hierarchy.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {string} modelName - The name of the Vertex AI model to use.
 * @returns {Promise<{text: string, sessionId: string, userId: string}>} The AI response and session data.
 */
const handleAuthenticatedPrompt = async (req, modelName) => {
  // 1. Validate request and get user context.
  // `validatePromptRequest` is assumed to check for a valid user object on the request.
  const { prompt, user, sessionId } = await validatePromptRequest(req);

  // 2. Authorization & Business Logic Checks
  // Ensure the user's workspace/tenant context is valid and they are allowed to make requests.
  const workspace = await WorkspaceService.getById(user.workspaceId);
  if (!workspace || workspace.status !== 'ACTIVE') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. The associated workspace is not active.');
  }

  // Check if the user and their workspace are within usage limits BEFORE making the expensive API call.
  const canMakeRequest = await UsageService.checkLimits(user.id, user.workspaceId);
  if (!canMakeRequest) {
    // This service should also be responsible for triggering notifications to admins/managers.
    throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Usage limit exceeded. Please upgrade your plan or contact your administrator.');
  }

  logger.info(`Received request for ${modelName}`, {
    userId: user.id,
    workspaceId: user.workspaceId,
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
        userId: user.id,
        workspaceId: user.workspaceId,
        sessionId,
        model: modelName,
        finishReason: responseStream.response.promptFeedback?.blockReason,
        safetyRatings: responseStream.response.promptFeedback?.safetyRatings,
        component: 'openAi.controller',
      });
      // Throw a specific error to be handled by the controller's response logic
      throw new ApiError(httpStatus.BAD_REQUEST, 'Your prompt was blocked due to safety concerns. Please rephrase your request.');
    }

    const resultText = responseStream.response.candidates[0].content.parts[0].text;
    const usageMetadata = responseStream.response.usageMetadata;

    // 3. Propagate usage details up the hierarchy
    // Record the token usage for the user and their workspace.
    // This is done asynchronously to avoid delaying the user's response.
    UsageService.recordUsage({
      userId: user.id,
      workspaceId: user.workspaceId,
      model: modelName,
      tokensUsed: usageMetadata?.totalTokenCount || 0,
      promptTokens: usageMetadata?.promptTokenCount || 0,
      completionTokens: usageMetadata?.candidatesTokenCount || 0,
    }).catch(err => {
      // Log error in usage recording, but don't fail the user's request
      logger.error('Failed to record usage data', {
        userId: user.id,
        workspaceId: user.workspaceId,
        errorMessage: err.message,
        component: 'openAi.controller',
      });
    });

    logger.info(`Successfully processed ${modelName} request`, {
      userId: user.id,
      workspaceId: user.workspaceId,
      sessionId,
      model: modelName,
      component: 'openAi.controller',
    });

    return { text: resultText, sessionId, userId: user.id };
  } catch (error) {
    logger.error(`Error calling Vertex AI for ${modelName}`, {
      userId: user.id,
      workspaceId: user.workspaceId,
      sessionId,
      model: modelName,
      errorMessage: error.message,
      errorStack: error.stack,
      component: 'openAi.controller',
    });
    // Re-throw the error to be caught by catchAsync
    throw error;
  }
};


/**
 * @openapi
 * /openai/gpt4o-mini:
 *   post:
 *     summary: Get response from GPT-4o-mini model (Migrated to Vertex AI Gemini 1.5 Flash)
 *     description: Generates an AI response using the Gemini 1.5 Flash model. Requires authenticated user context and respects workspace usage limits.
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
 *       400:
 *         description: Bad Request. Invalid prompt or blocked by safety filters.
 *       401:
 *         description: Unauthorized. User authentication required.
 *       402:
 *         description: Payment Required. Workspace usage limit has been exceeded.
 *       403:
 *         description: Forbidden. User or workspace is not active.
 */
const Gpt4oMiniGetResponse = catchAsync(async (req, res) => {
  // FIX: Delegate to the centralized handler to enforce business rules and usage tracking.
  const result = await handleAuthenticatedPrompt(req, 'gemini-1.5-flash');
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
 *     summary: Get response from GPT-4-Nano model (Migrated to Vertex AI Gemini 1.5 Pro)
 *     description: Generates an AI response using the Gemini 1.5 Pro model. Requires authenticated user context and respects workspace usage limits.
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
 *       400:
 *         description: Bad Request. Invalid prompt or blocked by safety filters.
 *       401:
 *         description: Unauthorized. User authentication required.
 *       402:
 *         description: Payment Required. Workspace usage limit has been exceeded.
 *       403:
 *         description: Forbidden. User or workspace is not active.
 */
const Gpt4NanoGetResponse = catchAsync(async (req, res) => {
  // FIX: Delegate to the centralized handler to enforce business rules and usage tracking.
  const result = await handleAuthenticatedPrompt(req, 'gemini-1.5-pro');
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
 *     summary: Get response anonymously from Vertex AI
 *     description: >
 *       Generates an AI response anonymously without requiring user authentication.
 *       SECURITY-NOTE: This is a public endpoint and is vulnerable to abuse (Denial-of-Wallet attacks).
 *       It MUST be protected by a strict rate-limiter based on IP address or other fingerprinting methods.
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
 *       400:
 *         description: Bad Request. Prompt is required.
 */
const OpenAiGetResponseAnonymously = catchAsync(async (req, res) => {
  // SECURITY-NOTE: This public endpoint is vulnerable to abuse and can incur significant costs.
  // It should be protected by a strict rate-limiter middleware in the route definition.
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