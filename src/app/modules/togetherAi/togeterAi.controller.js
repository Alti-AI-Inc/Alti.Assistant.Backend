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
 *     tags:
 *       - AI Image Generation
 *       - Google GenAI
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
 *                 description: User object, typically from authentication, containing user details for usage tracking.
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
 *         description: Bad request due to missing prompt, no image data, or error updating image usage.
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
 *       500:
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
const TogetherAiImgGeneration = catchAsync(async (req, res) => {
  const { user, sessionId, prompt } = req.body;
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
      return res
        .status(400)
        .json({ success: false, message: paymentResult.message });
    }
  } catch (error) {
    console.error('Error in incrementImagesUsed:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'An error occurred while updating image usage.',
    });
  }

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