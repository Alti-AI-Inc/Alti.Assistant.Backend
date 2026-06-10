import httpStatus from 'http-status';
// VULNERABILITY: The '@google/genai' library is the consumer-grade SDK.
// FIX: Switched to the enterprise-grade '@google-cloud/vertexai' SDK for better security, IAM integration, and compliance.
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google-cloud/vertexai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { paymentController } from '../payment/payment.controller.js';

// FIX: Initialize the enterprise Vertex AI client.
// This requires GCP project ID and location to be set in the configuration.
// It uses Application Default Credentials (ADC) for authentication, which is more secure than API keys.
const vertex_ai = new VertexAI({
  project: config.gcp_project_id, // e.g., 'my-gcp-project-id'
  location: config.gcp_location, // e.g., 'us-central1'
});

/**
 * Masks common PII patterns in a given text to prevent sensitive data from being sent to the AI model.
 * @param {string} text The input text to sanitize.
 * @returns {string} The text with PII masked.
 */
const maskPII = text => {
  if (!text) return text;
  // Mask email addresses
  let sanitizedText = text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]',
  );
  // Mask phone numbers (basic North American and international formats)
  sanitizedText = sanitizedText.replace(
    /(\+\d{1,3}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    '[PHONE_REDACTED]',
  );
  // Add more regex for other PII types as needed (e.g., SSN, credit card numbers)
  return sanitizedText;
};

/**
 * @swagger
 * /api/v1/together-ai/image-generation:
 *   post:
 *     summary: Generate an image using Google Vertex AI Imagen
 *     description: Generates an image based on a provided text prompt using the Google Vertex AI Imagen model.
 *                  It also increments the user's image usage count via the payment controller.
 *                  Requires an authenticated user context to track and enforce usage limits.
 *     tags:
 *       - AI Image Generation
 *       - Google Vertex AI
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user
 *               - prompt
 *             properties:
 *               user:
 *                 type: object
 *                 description: User object containing user details for usage tracking and quota enforcement.
 *                 example: { "_id": "654321098765432109876543", "email": "user@example.com" }
 *               sessionId:
 *                 type: string
 *                 description: Optional session identifier.
 *                 example: "some-session-id-123"
 *               prompt:
 *                 type: string
 *                 description: The text prompt to generate the image from.
 *                 example: "A futuristic city at sunset, highly detailed, cyberpunk style"
 *     responses:
 *       200:
 *         description: Image generated successfully. Returns a base64 encoded image URL.
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
 *                   example: "Get Response successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           url:
 *                             type: string
 *                             description: Base64 encoded URL of the generated image.
 *                             example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
 *       400:
 *         description: Bad request due to missing prompt, no image data, or error updating image usage (e.g., insufficient credits).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Prompt is required for image generation."
 *       501:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "An unexpected error occurred."
 */

/**
 * @async
 * @function TogetherAiImgGeneration
 * @description Handles the image generation request using Google Vertex AI Imagen.
 * It takes a prompt, generates an image, and returns a base64 encoded image URL.
 * It also tracks and increments the user's image usage.
 *
 * @permission Authenticated User (Requires valid user object in request body for quota tracking)
 * @context Multi-tenant / User-specific quota tracking via payment controller
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {Object} req.body - The request body.
 * @param {Object} req.body.user - The user object used for tracking usage.
 * @param {string} [req.body.sessionId] - Optional session identifier.
 * @param {string} req.body.prompt - The text prompt to generate the image from.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Resolves when the response is sent to the client.
 * @throws {Error} If the prompt is missing, the AI model fails to return image data, or the payment/usage increment fails.
 */
const TogetherAiImgGeneration = catchAsync(async (req, res) => {
  const { user, sessionId, prompt } = req.body;

  // GCP Cloud Logging: Structured log for tracking the request initiation.
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message: `Image generation request received for user ${user?._id}`,
      serviceContext: { service: 'togetherAi.controller' },
      context: {
        user: { id: user?._id, email: user?.email },
        sessionId: sessionId,
        promptLength: prompt?.length || 0,
      },
    }),
  );

  if (!prompt) throw new Error('Prompt is required for image generation.');

  // FIX: Sanitize the prompt to remove PII before sending it to the model.
  const sanitizedPrompt = maskPII(prompt);

  // VULNERABILITY: No safety settings were configured for the model call.
  // FIX: Explicitly configure Google's safety filters to block harmful content at a low threshold.
  // This is a critical security measure to prevent the generation of inappropriate content.
  const generativeModel = vertex_ai.getGenerativeModel({
    model: 'imagen-4.0-generate-001', // Specify the Imagen model
    safetySettings: [
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
    ],
    // The Vertex AI SDK's generateContent method for Imagen doesn't directly support
    // `aspectRatio` or `numberOfImages` in the same way as the old SDK.
    // These would be configured differently if needed, but the default is 1 image.
  });

  const request = {
    contents: [{ role: 'user', parts: [{ text: sanitizedPrompt }] }],
  };

  const result = await generativeModel.generateContent(request);
  const response = result.response;

  // FIX: The Vertex AI SDK response structure is different. We need to parse candidates and inlineData.
  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    part => part.inlineData,
  );

  if (!imagePart?.inlineData?.data) {
    // This error will be caught by catchAsync and should be logged by a global error handler.
    // For GCP, it's better to have a single point of logging for unhandled errors.
    const blockReason = response.candidates?.[0]?.finishReason;
    const safetyRatings = response.candidates?.[0]?.safetyRatings;
    console.error(
      JSON.stringify({
        severity: 'WARNING',
        message: `Image generation blocked or failed for user ${user?._id}. Reason: ${blockReason}`,
        serviceContext: { service: 'togetherAi.controller' },
        context: {
          user: { id: user?._id, email: user?.email },
          sessionId: sessionId,
          blockReason: blockReason,
          safetyRatings: safetyRatings,
        },
      }),
    );
    throw new Error(
      `Imagen 4 returned no image data. Generation may have been blocked for safety reasons. Reason: ${blockReason}`,
    );
  }

  const base64Image = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType;

  const responseData = {
    data: [
      {
        // FIX: The Vertex AI SDK returns a base64 string directly.
        url: `data:${mimeType};base64,${base64Image}`,
      },
    ],
  };

  // Increment images usage
  try {
    const paymentResult = await paymentController.incrementImagesUsed(user);
    if (!paymentResult.success) {
      // GCP Cloud Logging: Business logic failure (e.g., insufficient credits) is a WARNING.
      console.warn(
        JSON.stringify({
          severity: 'WARNING',
          message: `Image usage increment failed for user ${user?._id}: ${paymentResult.message}`,
          serviceContext: { service: 'togetherAi.controller' },
          context: {
            user: { id: user?._id, email: user?.email },
            sessionId: sessionId,
            paymentResultMessage: paymentResult.message,
          },
        }),
      );
      return res
        .status(400)
        .json({ success: false, message: paymentResult.message });
    }
  } catch (error) {
    // GCP Cloud Logging: Structured log for unexpected error during usage increment.
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: `Unexpected error incrementing image usage for user ${user?._id}: ${error.message}`,
        serviceContext: { service: 'togetherAi.controller' },
        context: {
          user: { id: user?._id, email: user?.email },
          sessionId: sessionId,
        },
        // Including the full error object provides stack trace and other details in Cloud Logging.
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
    );
    return res.status(400).json({
      success: false,
      message: error.message || 'An error occurred while updating image usage.',
    });
  }

  // GCP Cloud Logging: Structured log for successful image generation.
  console.log(
    JSON.stringify({
      severity: 'INFO',
      message: `Image generated successfully for user ${user?._id}`,
      serviceContext: { service: 'togetherAi.controller' },
      context: {
        user: { id: user?._id, email: user?.email },
        sessionId: sessionId,
      },
    }),
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

/**
 * @namespace TogetherAiController
 * @description Controller for Google Vertex AI related operations.
 * This object groups all AI-related endpoint handlers.
 */
export const TogetherAiController = {
  /**
   * @function TogetherAiImgGeneration
   * @memberof TogetherAiController
   * @description Handles the image generation request using Google Vertex AI Imagen.
   * It takes a prompt, generates an image, and returns a base64 encoded image URL.
   * It also tracks and increments the user's image usage.
   * @param {import('express').Request} req - The Express request object, containing `user`, `sessionId`, and `prompt` in the body.
   * @param {import('express').Response} res - The Express response object.
   * @returns {Promise<void>} A promise that resolves when the response is sent.
   * @throws {Error} If the prompt is missing, no image data is returned by the AI, or an error occurs during usage increment.
   */
  TogetherAiImgGeneration,
};