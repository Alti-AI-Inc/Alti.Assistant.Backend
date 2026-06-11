/**
 * @file Manages interactions with the Google Vertex AI service for generating AI responses.
 * This controller handles both authenticated (multi-tenant) and anonymous requests,
 * applying business logic such as usage tracking, PII masking, and content safety filtering.
 * It also includes special provisions for Platform Owners to bypass tenant limits for
 * administrative purposes and utilizes a dynamic configuration service for system-wide settings.
 * @module modules/openAi/openAi.controller
 */
import httpStatus from 'http-status';
import { randomUUID } from 'crypto';
import winston from 'winston';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
// IMPROVEMENT: Import services for business logic, authorization, usage tracking, and platform configuration.
import { UsageService } from '../usage/usage.service.js';
import { WorkspaceService } from '../workspace/workspace.service.js';
import ApiError from '../../../errors/ApiError.js'; // Assumed path for a custom error class

// PLATFORM OWNER FEATURE: In a real application, this service would be in its own file.
// It is mocked here to demonstrate how a Platform Owner can manage system-wide settings
// without requiring code deployments. It centralizes configurable parameters.
const PlatformConfigService = {
  /**
   * Fetches the current global safety settings for Vertex AI.
   * @returns {Promise<Array<{category: HarmCategory, threshold: HarmBlockThreshold}>>}
   */
  getSafetySettings: async () => {
    // In a real implementation, this would fetch from a database (e.g., PlatformSettings collection).
    // This allows the Platform Owner to change safety levels across the entire platform.
    return [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
    ];
  },

  /**
   * Gets the underlying AI model name for a given public-facing endpoint alias.
   * @param {string} alias - The alias used in the route (e.g., 'gpt4o-mini').
   * @returns {Promise<string>} The actual model name (e.g., 'gemini-1.5-flash-001').
   */
  getModelForAlias: async (alias) => {
    // This mapping allows the Platform Owner to switch out the underlying model for an endpoint
    // for A/B testing, cost optimization, or version upgrades, providing global control.
    const modelMap = {
      'gpt4o-mini': 'gemini-1.5-flash',
      'gpt4-nano': 'gemini-1.5-pro',
    };
    return modelMap[alias] || 'gemini-1.5-flash'; // Default fallback
  },
};


/**
 * A Winston logger configured for compatibility with Google Cloud Logging (Stackdriver).
 * It outputs structured JSON with a 'severity' property, which Cloud Logging automatically recognizes,
 * facilitating better log analysis and monitoring in a cloud environment.
 * @type {winston.Logger}
 */
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

/**
 * Initialized instance of the Vertex AI SDK.
 * Configured with the Google Cloud project and location from environment variables.
 * @type {VertexAI}
 */
const vertexAI = new VertexAI({
  project: process.env.GCP_PROJECT || 'placeholder-project',
  location: process.env.GCP_LOCATION || 'us-central1',
});

/**
 * Masks sensitive Personally Identifiable Information (PII) from the input text.
 * Replaces emails, phone numbers, SSNs, and credit card numbers with placeholders.
 * @param {string} text - The input text to sanitize.
 * @returns {string} The sanitized text with PII masked.
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

/**
 * Centralized handler for authenticated AI prompt requests.
 * This function encapsulates the core logic for:
 * 1. Validating user and workspace context.
 * 2. Checking usage limits against tenant quotas, with an override for Platform Owners.
 * 3. Calling the AI model using centrally configured settings.
 * 4. Recording usage data for the user and their workspace.
 *
 * @permission Requires an authenticated user with a valid JWT. Platform Owners have elevated privileges.
 * @tenant-context The user must belong to an active workspace (`user.workspaceId`). All usage checks and recording are scoped to this workspace.
 * @param {import('express').Request} req - The Express request object, containing user context and the prompt.
 * @param {string} modelName - The name of the Vertex AI model to use (e.g., 'gemini-1.5-flash').
 * @returns {Promise<{text: string, sessionId: string, userId: string}>} A promise that resolves to an object containing the AI's response text, session ID, and user ID.
 * @throws {ApiError} Throws an ApiError if the workspace is inactive, usage limits are exceeded, or the prompt is blocked by safety filters.
 */
const handleAuthenticatedPrompt = async (req, modelName) => {
  // 1. Validate request and get user context.
  const { prompt, user, sessionId } = await validatePromptRequest(req);

  // 2. Authorization & Business Logic Checks
  // PLATFORM OWNER FEATURE: A Platform Owner can bypass standard tenant checks for administrative and support tasks.
  const isPlatformOwner = user.role === 'PLATFORM_OWNER';

  if (isPlatformOwner) {
    // PLATFORM OWNER OVERSIGHT: Log when an override is used for audit purposes.
    logger.warn('Platform Owner is bypassing tenant usage limits and status checks.', {
      userId: user.id,
      userRole: user.role,
      workspaceId: user.workspaceId, // Log which tenant they are operating on
      override: 'TENANT_USAGE_LIMITS_AND_STATUS',
      component: 'openAi.controller',
    });
  } else {
    // Standard tenant checks for non-admin users.
    const workspace = await WorkspaceService.getById(user.workspaceId);
    // PLATFORM OWNER FEATURE: The ability to set a workspace status to 'SUSPENDED' or 'INACTIVE'
    // is enforced here, allowing the Platform Owner to disable tenants.
    if (!workspace || workspace.status !== 'ACTIVE') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. The associated workspace is not active.');
    }

    const canMakeRequest = await UsageService.checkLimits(user.id, user.workspaceId);
    if (!canMakeRequest) {
      throw new ApiError(httpStatus.PAYMENT_REQUIRED, 'Usage limit exceeded. Please upgrade your plan or contact your administrator.');
    }
  }

  // PLATFORM OWNER OVERSIGHT: Include user role in logs for better global monitoring and filtering.
  logger.info(`Received request for ${modelName}`, {
    userId: user.id,
    userRole: user.role,
    workspaceId: user.workspaceId,
    sessionId,
    model: modelName,
    component: 'openAi.controller',
  });

  // Mask PII before transmitting data to Vertex AI
  const sanitizedPrompt = maskPII(prompt);

  try {
    // PLATFORM OWNER FEATURE: Fetch system-wide safety configuration. This allows the Platform Owner
    // to adjust content moderation levels globally without a code deployment.
    const safetySettings = await PlatformConfigService.getSafetySettings();

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
        userRole: user.role,
        workspaceId: user.workspaceId,
        sessionId,
        model: modelName,
        finishReason: responseStream.response.promptFeedback?.blockReason,
        safetyRatings: responseStream.response.promptFeedback?.safetyRatings,
        component: 'openAi.controller',
      });
      throw new ApiError(httpStatus.BAD_REQUEST, 'Your prompt was blocked due to safety concerns. Please rephrase your request.');
    }

    const resultText = responseStream.response.candidates[0].content.parts[0].text;
    const usageMetadata = responseStream.response.usageMetadata;

    // 3. Record usage details for the tenant, unless it's a Platform Owner action.
    if (!isPlatformOwner) {
      UsageService.recordUsage({
        userId: user.id,
        workspaceId: user.workspaceId,
        model: modelName,
        tokensUsed: usageMetadata?.totalTokenCount || 0,
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
      }).catch(err => {
        logger.error('Failed to record usage data', {
          userId: user.id,
          workspaceId: user.workspaceId,
          errorMessage: err.message,
          component: 'openAi.controller',
        });
      });
    }

    logger.info(`Successfully processed ${modelName} request`, {
      userId: user.id,
      userRole: user.role,
      workspaceId: user.workspaceId,
      sessionId,
      model: modelName,
      component: 'openAi.controller',
    });

    return { text: resultText, sessionId, userId: user.id };
  } catch (error) {
    logger.error(`Error calling Vertex AI for ${modelName}`, {
      userId: user.id,
      userRole: user.role,
      workspaceId: user.workspaceId,
      sessionId,
      model: modelName,
      errorMessage: error.message,
      errorStack: error.stack,
      component: 'openAi.controller',
    });
    throw error;
  }
};


/**
 * Express controller to get a response from the Gemini 1.5 Flash model.
 * This endpoint delegates all business logic to the `handleAuthenticatedPrompt` function.
 * @permission Requires an authenticated user.
 * @tenant-context Scoped to the user's active workspace.
 */
/**
 * @openapi
 * /openai/gpt4o-mini:
 *   post:
 *     summary: Get response from GPT-4o-mini model (Migrated to Vertex AI Gemini 1.5 Flash)
 *     description: Generates an AI response using a model configured by the Platform Owner. Requires authenticated user context and respects workspace usage limits.
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
  // PLATFORM OWNER FEATURE: Fetch the underlying model from the platform configuration.
  // This allows the Platform Owner to change the model for this endpoint without a code deployment.
  const modelName = await PlatformConfigService.getModelForAlias('gpt4o-mini');
  const result = await handleAuthenticatedPrompt(req, modelName);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * Express controller to get a response from the Gemini 1.5 Pro model.
 * This endpoint delegates all business logic to the `handleAuthenticatedPrompt` function.
 * @permission Requires an authenticated user.
 * @tenant-context Scoped to the user's active workspace.
 */
/**
 * @openapi
 * /openai/gpt4-nano:
 *   post:
 *     summary: Get response from GPT-4-Nano model (Migrated to Vertex AI Gemini 1.5 Pro)
 *     description: Generates an AI response using a model configured by the Platform Owner. Requires authenticated user context and respects workspace usage limits.
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
  // PLATFORM OWNER FEATURE: Fetch the underlying model from the platform configuration.
  const modelName = await PlatformConfigService.getModelForAlias('gpt4-nano');
  const result = await handleAuthenticatedPrompt(req, modelName);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

/**
 * Express controller to get an AI response anonymously.
 * This public endpoint does not require authentication and is intended for limited, public-facing use cases.
 * It is critical to protect this endpoint with strict rate-limiting to prevent abuse and control costs.
 * @permission Public, no authentication required.
 */
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

  const sanitizedPrompt = maskPII(prompt);

  try {
    // Use the same centrally managed safety settings for consistency.
    const safetySettings = await PlatformConfigService.getSafetySettings();

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
 * An object containing the controller functions for the OpenAI/Vertex AI module.
 * These functions are designed to be used as route handlers in an Express application.
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