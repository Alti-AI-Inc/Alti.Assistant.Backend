import express from 'express';
import { createImageController } from '../controllers/imageController.js';

/**
 * Utility function to wrap asynchronous Express route handlers.
 *
 * This function catches any errors that occur during the execution of an
 * asynchronous handler and passes them to Express's `next` function.
 * This prevents unhandled promise rejections from crashing the application
 * and ensures errors are properly handled by the Express error handling middleware.
 *
 * @param {function(express.Request, express.Response, express.NextFunction): Promise<any>} fn - The asynchronous route handler function to wrap.
 *   It should accept Express's `req`, `res`, and `next` arguments and return a Promise.
 * @returns {function(express.Request, express.Response, express.NextFunction): void} A new synchronous route handler function
 *   that executes the original async function and catches any errors.
 */
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Creates and configures an Express router for image-related operations.
 *
 * This function initializes an Express router and attaches various image processing
 * endpoints such as image editing, generation, and direct generation. It leverages
 * a controller created with provided services to handle the business logic for each route.
 * All endpoints defined in this router require user authentication.
 *
 * @param {object} sessionManager - The session manager instance, used for authenticating and retrieving user context for requests.
 * @param {object} imageService - The image service instance, which handles the core logic of image manipulation and generation.
 * @param {object} promptService - The prompt service instance, which manages prompt processing, potentially enhancing or validating them before use with AI models.
 * @returns {express.Router} An Express router instance configured with all image-related API routes.
 */
export const createImageRoutes = (
  sessionManager,
  imageService,
  promptService
) => {
  const router = express.Router();
  const controller = createImageController(
    sessionManager,
    imageService,
    promptService
  );

  /**
   * @swagger
   * /api/image/edit:
   *   post:
   *     summary: Edit an existing image based on a prompt.
   *     description: Submits a request to modify an existing image using AI or other processing, guided by a textual prompt and specific options. This endpoint requires authentication.
   *     tags:
   *       - Image
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - imageId
   *               - prompt
   *             properties:
   *               imageId:
   *                 type: string
   *                 description: The ID or URL of the image to be edited.
   *                 example: "img_12345"
   *               prompt:
   *                 type: string
   *                 description: The textual prompt describing the desired edits to the image.
   *                 example: "Change the background to a sunny beach, add a hat to the person."
   *               options:
   *                 type: object
   *                 description: Optional parameters for the image editing process (e.g., style, resolution, specific AI model parameters).
   *                 additionalProperties: true
   *                 example: { style: "photorealistic", resolution: "1024x1024" }
   *     responses:
   *       200:
   *         description: Image editing request successfully initiated or completed.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Image editing process started."
   *                 data:
   *                   type: object
   *                   description: Details about the edited image or the editing job.
   *                   properties:
   *                     jobId:
   *                       type: string
   *                       example: "edit_job_67890"
   *                     imageUrl:
   *                       type: string
   *                       example: "https://example.com/edited_image.png"
   *       400:
   *         description: Invalid request payload or missing required parameters.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized. Authentication token is missing or invalid.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error during image editing.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/edit', asyncHandler(controller.editImage));

  /**
   * @swagger
   * /api/image/generate:
   *   post:
   *     summary: Generate a new image from a textual prompt.
   *     description: Creates a new image using AI or other generative models based on a detailed textual prompt and specific generation options. This endpoint requires authentication.
   *     tags:
   *       - Image
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
   *                 description: The textual prompt describing the desired image to generate.
   *                 example: "A futuristic city at sunset, with flying cars and neon lights."
   *               options:
   *                 type: object
   *                 description: Optional parameters for the image generation process (e.g., style, resolution, number of images, specific AI model parameters).
   *                 additionalProperties: true
   *                 example: { style: "cyberpunk", resolution: "1024x1024", numImages: 1 }
   *     responses:
   *       200:
   *         description: Image generation request successfully initiated or completed.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Image generation process started."
   *                 data:
   *                   type: object
   *                   description: Details about the generated image(s) or the generation job.
   *                   properties:
   *                     jobId:
   *                       type: string
   *                       example: "gen_job_11223"
   *                     imageUrls:
   *                       type: array
   *                       items:
   *                         type: string
   *                       example: ["https://example.com/generated_image_1.png"]
   *       400:
   *         description: Invalid request payload or missing required parameters.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized. Authentication token is missing or invalid.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error during image generation.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/generate', asyncHandler(controller.generateImage));

  /**
   * @swagger
   * /api/image/generate-direct:
   *   post:
   *     summary: Directly generate a new image from a textual prompt without intermediate steps.
   *     description: Provides a streamlined endpoint for image generation, potentially bypassing certain queues or complex workflows, for direct and immediate image creation. This endpoint requires authentication.
   *     tags:
   *       - Image
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
   *                 description: The textual prompt describing the desired image to generate directly.
   *                 example: "A serene landscape with a waterfall and cherry blossom trees."
   *               options:
   *                 type: object
   *                 description: Optional parameters for the direct image generation process (e.g., specific AI model, quality settings).
   *                 additionalProperties: true
   *                 example: { model: "fast-gen-v2", quality: "high" }
   *     responses:
   *       200:
   *         description: Direct image generation request successfully completed.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                   example: true
   *                 message:
   *                   type: string
   *                   example: "Image generated directly."
   *                 data:
   *                   type: object
   *                   description: Details about the directly generated image.
   *                   properties:
   *                     imageUrl:
   *                       type: string
   *                       example: "https://example.com/direct_image.png"
   *       400:
   *         description: Invalid request payload or missing required parameters.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Unauthorized. Authentication token is missing or invalid.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error during direct image generation.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/generate-direct', asyncHandler(controller.generateImageDirect));

  return router;
};