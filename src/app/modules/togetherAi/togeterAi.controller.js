import httpStatus from 'http-status';
import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { paymentController } from '../payment/payment.controller.js';

/**
 * @constant {GoogleGenAI} ai - An instance of the GoogleGenAI client, initialized with the API key from configuration.
 * This client is used to interact with Google's generative AI models, specifically for image generation.
 */
const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

/**
 * @swagger
 * /api/v1/together-ai/image-generation:
 *   post:
 *     summary: Generate an image using Google GenAI Imagen 4.0
 *     description: Generates an image based on a provided text prompt using the Google GenAI Imagen 4.0 model.
 *                  It also increments the user's image usage count via the payment controller.
 *                  Requires an authenticated user context to track and enforce usage limits.
 *     tags:
 *       - AI Image Generation
 *       - Google GenAI
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
 * @description Handles the image generation request using Google GenAI Imagen 4.0.
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
  console.log(JSON.stringify({
    severity: 'INFO',
    message: `Image generation request received for user ${user?._id}`,
    serviceContext: { service: 'togetherAi.controller' },
    context: {
      user: { id: user?._id, email: user?.email },
      sessionId: sessionId,
      promptLength: prompt?.length || 0
    }
  }));

  if (!prompt) throw new Error('Prompt is required for image generation.');

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '1:1',
    },
  });

  const generatedImage = response.generatedImages?.[0];
  if (!generatedImage?.image?.imageBytes) {
    // This error will be caught by catchAsync and should be logged by a global error handler.
    // For GCP, it's better to have a single point of logging for unhandled errors.
    throw new Error('Imagen 4 returned no image data.');
  }

  const responseData = {
    data: [{
      url: `data:image/png;base64,${Buffer.from(generatedImage.image.imageBytes).toString('base64')}`,
    }],
  };

  // Increment images usage
  try {
    const paymentResult = await paymentController.incrementImagesUsed(user);
    if (!paymentResult.success) {
      // GCP Cloud Logging: Business logic failure (e.g., insufficient credits) is a WARNING.
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: `Image usage increment failed for user ${user?._id}: ${paymentResult.message}`,
        serviceContext: { service: 'togetherAi.controller' },
        context: {
          user: { id: user?._id, email: user?.email },
          sessionId: sessionId,
          paymentResultMessage: paymentResult.message
        }
      }));
      return res
        .status(400)
        .json({ success: false, message: paymentResult.message });
    }
  } catch (error) {
    // GCP Cloud Logging: Structured log for unexpected error during usage increment.
    console.error(JSON.stringify({
        severity: 'ERROR',
        message: `Unexpected error incrementing image usage for user ${user?._id}: ${error.message}`,
        serviceContext: { service: 'togetherAi.controller' },
        context: {
          user: { id: user?._id, email: user?.email },
          sessionId: sessionId
        },
        // Including the full error object provides stack trace and other details in Cloud Logging.
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
    }));
    return res.status(400).json({
      success: false,
      message: error.message || 'An error occurred while updating image usage.',
    });
  }

  // GCP Cloud Logging: Structured log for successful image generation.
  console.log(JSON.stringify({
    severity: 'INFO',
    message: `Image generated successfully for user ${user?._id}`,
    serviceContext: { service: 'togetherAi.controller' },
    context: {
      user: { id: user?._id, email: user?.email },
      sessionId: sessionId
    }
  }));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

/**
 * @namespace TogetherAiController
 * @description Controller for Together AI (or Google GenAI as implemented) related operations.
 * This object groups all AI-related endpoint handlers.
 */
export const TogetherAiController = {
  /**
   * @function TogetherAiImgGeneration
   * @memberof TogetherAiController
   * @description Handles the image generation request using Google GenAI Imagen 4.0.
   * It takes a prompt, generates an image, and returns a base64 encoded image URL.
   * It also tracks and increments the user's image usage.
   * @param {import('express').Request} req - The Express request object, containing `user`, `sessionId`, and `prompt` in the body.
   * @param {import('express').Response} res - The Express response object.
   * @returns {Promise<void>} A promise that resolves when the response is sent.
   * @throws {Error} If the prompt is missing, no image data is returned by the AI, or an error occurs during usage increment.
   */
  TogetherAiImgGeneration,
};