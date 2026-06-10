import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
// import { ConversationChain } from 'langchain/chains';
import { GeminiAiService } from './gemini.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';
// Platform Owner AI Enhancement: Assuming an auth middleware populates req.user
// and a role checker utility exists for protecting admin routes.
// import { auth, checkRole } from '../../../middlewares/auth.js';
// import { USER_ROLE } from '../../../enums/user.js';

// =================================================================================================
// == PII Masking Utility
// =================================================================================================

/**
 * Masks common PII patterns in a given text before sending to the model.
 * This is a critical safety and privacy measure.
 * @param {string} text The input text to sanitize.
 * @returns {string} The text with PII masked.
 */
const maskPII = text => {
  if (!text || typeof text !== 'string') return text;

  let maskedText = text;

  // Mask email addresses
  maskedText = maskedText.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]',
  );

  // Mask phone numbers (various common formats)
  maskedText = maskedText.replace(
    /(\+\d{1,3}[- ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g,
    '[PHONE_REDACTED]',
  );

  // Mask Social Security Numbers (SSN)
  maskedText = maskedText.replace(
    /\b\d{3}-\d{2}-\d{4}\b/g,
    '[SSN_REDACTED]',
  );

  // Mask credit card numbers (basic check for 13-16 digits, with a simple Luhn check to reduce false positives)
  maskedText = maskedText.replace(/\b(?:\d[ -]*?){13,16}\b/g, match => {
    const s = match.replace(/\D/g, '');
    if (s.length < 13 || s.length > 16) {
      return match; // Not a typical CC length
    }
    let nCheck = 0;
    let bEven = false;
    for (let n = s.length - 1; n >= 0; n--) {
      const cDigit = s.charAt(n);
      let nDigit = parseInt(cDigit, 10);
      if (bEven && (nDigit *= 2) > 9) nDigit -= 9;
      nCheck += nDigit;
      bEven = !bEven;
    }
    return nCheck % 10 == 0 ? '[CREDIT_CARD_REDACTED]' : match;
  });

  return maskedText;
};

// =================================================================================================
// == Public Endpoints
// =================================================================================================

/**
 * @swagger
 * /api/v1/gemini/get-response:
 *   post:
 *     summary: Get a response from the Gemini AI model.
 *     description: Processes a user prompt using the Gemini AI service, managing session and user context. Platform Owners bypass tenant-specific rate limits.
 *     tags:
 *       - Gemini AI - Public
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid.
 *       429:
 *         description: Too Many Requests - Tenant rate limit exceeded.
 */
const GeminiAiGetResponse = catchAsync(async (req, res) => {
  // Platform Owner AI Enhancement: The validatePromptRequest function should be aware of user roles
  // to bypass tenant-specific limits for Platform Owners.
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  if (errorResponse) {
    return sendResponse(res, {
      statusCode: errorResponse.statusCode || httpStatus.BAD_REQUEST,
      success: false,
      message: errorResponse.message || 'Validation failed.',
      data: null,
    });
  }

  // Vertex AI Safety Guard: Mask PII from the prompt before sending it to the service layer and the model.
  const maskedPrompt = maskPII(prompt);

  // Platform Owner AI Enhancement: Pass role-based options to the service layer.
  // This allows the service to bypass throttling or apply special logic for admins.
  const serviceOptions = {
    isPlatformOwner: req.user?.role === 'PLATFORM_OWNER', // Assumes auth middleware sets req.user
  };

  const result = await GeminiAiService.geminiService(
    sessionId,
    maskedPrompt, // Use the sanitized prompt
    userId,
    serviceOptions,
  );

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
 *     description: Processes a user prompt using the Gemini 2.5 Preview AI service. Platform Owners bypass tenant-specific rate limits.
 *     tags:
 *       - Gemini AI - Public
 *     security:
 *       - bearerAuth: []
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
 *       400:
 *         description: Bad Request - Validation failed or invalid input.
 *       401:
 *         description: Unauthorized - Authentication token is missing or invalid.
 *       429:
 *         description: Too Many Requests - Tenant rate limit exceeded.
 */
const Gemini25PreviewAiGetResponse = catchAsync(async (req, res) => {
  const { prompt, userId, sessionId, errorResponse } =
    await validatePromptRequest(req);

  if (errorResponse) {
    return sendResponse(res, {
      statusCode: errorResponse.statusCode || httpStatus.BAD_REQUEST,
      success: false,
      message: errorResponse.message || 'Validation failed.',
      data: null,
    });
  }

  // Vertex AI Safety Guard: Mask PII from the prompt before sending it to the service layer and the model.
  const maskedPrompt = maskPII(prompt);

  // Platform Owner AI Enhancement: Pass role-based options to the service layer.
  const serviceOptions = {
    isPlatformOwner: req.user?.role === 'PLATFORM_OWNER',
  };

  const result = await GeminiAiService.gemini25PreviewService(
    sessionId,
    maskedPrompt, // Use the sanitized prompt
    userId,
    serviceOptions,
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

// =================================================================================================
// == Platform Owner / Super Admin Endpoints
// =================================================================================================

/**
 * @swagger
 * /api/v1/gemini/admin/stats:
 *   get:
 *     summary: Get global Gemini usage statistics.
 *     description: (Platform Owner Only) Retrieves platform-wide usage statistics for the Gemini service, such as total requests, token counts, and usage by tenant.
 *     tags:
 *       - Gemini AI - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved global statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRequests:
 *                   type: integer
 *                   example: 10523
 *                 totalTokens:
 *                   type: integer
 *                   example: 8418400
 *                 usageByTenant:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tenantId:
 *                         type: string
 *                         example: "tenant-abc"
 *                       requestCount:
 *                         type: integer
 *                         example: 5120
 *                       tokenCount:
 *                         type: integer
 *                         example: 4096000
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User is not a Platform Owner.
 */
const getGlobalUsageStats = catchAsync(async (req, res) => {
  // In a real app, this route would be protected by auth and role-checking middleware:
  // e.g., router.get('/admin/stats', auth, checkRole('PLATFORM_OWNER'), getGlobalUsageStats);
  const stats = await GeminiAiService.getPlatformStats();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform-wide statistics retrieved successfully.',
    data: stats,
  });
});

/**
 * @swagger
 * /api/v1/gemini/admin/logs:
 *   get:
 *     summary: Get global Gemini interaction logs.
 *     description: (Platform Owner Only) Retrieves a paginated list of all prompts and responses across all tenants for auditing and oversight.
 *     tags:
 *       - Gemini AI - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of logs per page.
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Filter logs by a specific tenant ID.
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter logs by a specific user ID.
 *     responses:
 *       200:
 *         description: Successfully retrieved global logs.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User is not a Platform Owner.
 */
const getGlobalLogs = catchAsync(async (req, res) => {
  const filters = req.query; // Contains page, limit, tenantId, etc.
  const logs = await GeminiAiService.getPlatformLogs(filters);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform-wide logs retrieved successfully.',
    data: logs,
  });
});

/**
 * @swagger
 * /api/v1/gemini/admin/config:
 *   get:
 *     summary: Get global Gemini module configuration.
 *     description: (Platform Owner Only) Retrieves the current system-wide configuration for the Gemini module.
 *     tags:
 *       - Gemini AI - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabledModels:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["gemini-pro", "gemini-2.5-preview"]
 *                 globalSafetySettings:
 *                   type: object
 *                   example: { "HARM_CATEGORY_HARASSMENT": "BLOCK_MEDIUM_AND_ABOVE" }
 *                 defaultModel:
 *                   type: string
 *                   example: "gemini-pro"
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User is not a Platform Owner.
 *   put:
 *     summary: Update global Gemini module configuration.
 *     description: (Platform Owner Only) Updates the system-wide configuration for the Gemini module.
 *     tags:
 *       - Gemini AI - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabledModels:
 *                 type: array
 *                 items:
 *                   type: string
 *               globalSafetySettings:
 *                 type: object
 *               defaultModel:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configuration updated successfully.
 *       400:
 *         description: Bad Request - Invalid configuration payload.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - User is not a Platform Owner.
 */
const getPlatformConfiguration = catchAsync(async (req, res) => {
  const config = await GeminiAiService.getPlatformConfig();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform configuration retrieved successfully.',
    data: config,
  });
});

const updatePlatformConfiguration = catchAsync(async (req, res) => {
  const newConfig = req.body;
  const updatedConfig = await GeminiAiService.updatePlatformConfig(newConfig);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Platform configuration updated successfully.',
    data: updatedConfig,
  });
});

/**
 * @typedef {object} GeminiAiController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} GeminiAiGetResponse - Controller for getting a response from the standard Gemini AI model.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} Gemini25PreviewAiGetResponse - Controller for getting a response from the Gemini 2.5 Preview AI model.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getGlobalUsageStats - (Admin) Controller for retrieving global usage statistics.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getGlobalLogs - (Admin) Controller for retrieving global interaction logs.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getPlatformConfiguration - (Admin) Controller for retrieving platform-wide Gemini configuration.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} updatePlatformConfiguration - (Admin) Controller for updating platform-wide Gemini configuration.
 */

/**
 * Controller object for handling Gemini AI related requests.
 * Exposes methods for interacting with different Gemini AI models
 * and for platform-level administration of the Gemini module.
 * @type {GeminiAiController}
 */
export const GeminiAiController = {
  // Public
  GeminiAiGetResponse,
  Gemini25PreviewAiGetResponse,

  // Admin
  getGlobalUsageStats,
  getGlobalLogs,
  getPlatformConfiguration,
  updatePlatformConfiguration,
};