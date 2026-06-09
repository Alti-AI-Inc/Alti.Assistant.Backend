import config from '../../../../../config/index.js';

/**
 * @typedef {object} SessionManager
 * @property {function(string): object} getSession - Retrieves a session by ID.
 * @property {function(string): Array<object>} getConversationHistory - Retrieves conversation history for a session.
 * @property {function(string): void} deleteSession - Deletes a session by ID.
 */

/**
 * @typedef {object} ImageService
 * @property {function(string, string): Promise<string>} generateImage - Generates an image based on a prompt and filename.
 */

/**
 * @typedef {object} PromptService
 * @property {function(Array<object>): Promise<string>} buildEnhancedPrompt - Builds an enhanced prompt from conversation history.
 */

/**
 * Creates an image controller with various image manipulation and generation functionalities.
 * This controller handles requests related to editing existing images and generating new ones,
 * leveraging session management and prompt enhancement services.
 *
 * @param {SessionManager} sessionManager - The session manager instance for handling user sessions.
 * @param {ImageService} imageService - The image service instance for generating images.
 * @param {PromptService} promptService - The prompt service instance for enhancing prompts.
 * @returns {object} An object containing controller methods for image operations.
 */
export const createImageController = (
  sessionManager,
  imageService,
  promptService
) => {
  return {
    /**
     * @swagger
     * /api/images/edit:
     *   post:
     *     summary: Edits an existing image based on a text prompt.
     *     description: Edits an image provided as a Base64 string using a text prompt and the Imagen3 service.
     *                  Requires both a prompt and the image data.
     *     tags:
     *       - Enhanced Image
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - prompt
     *               - imageBase64
     *             properties:
     *               prompt:
     *                 type: string
     *                 description: The text prompt to guide the image editing.
     *                 example: "Make the cat wear a tiny hat"
     *               imageBase64:
     *                 type: string
     *                 format: byte
     *                 description: The Base64 encoded string of the image to be edited.
     *                 example: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA..."
     *     responses:
     *       200:
     *         description: Image successfully edited.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 image:
     *                   type: string
     *                   description: The URL or Base64 string of the edited image.
     *                   example: "https://example.com/edited-image.png"
     *                 prompt:
     *                   type: string
     *                   description: The prompt used for editing.
     *                   example: "Make the cat wear a tiny hat"
     *       400:
     *         description: Bad request, missing prompt or imageBase64.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "prompt is required"
     *       500:
     *         description: Internal server error during image editing.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "Failed to edit image due to external service error."
     */
    editImage: async (req, res) => {
      try {
        const { prompt, imageBase64 } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'prompt is required',
          });
        }

        if (!imageBase64) {
          return res.status(400).json({
            success: false,
            error: 'imageBase64 is required',
          });
        }

        // Import imagen3 service
        const { editImageWithImagen3 } = await import(
          '../utils/imagen3.service.js'
        );
        const apiKey = config.gemini_secret_key;

        const timestamp = Date.now();
        const filename = `image-edit-${timestamp}.png`;

        // Edit image using Imagen3
        const imageResult = await editImageWithImagen3(
          prompt,
          imageBase64,
          filename,
          apiKey
        );

        res.json({
          success: true,
          image: imageResult,
          prompt,
        });
      } catch (error) {
        console.error('Error editing image:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    /**
     * @swagger
     * /api/images/generate:
     *   post:
     *     summary: Generates an image based on a session's context or a custom prompt.
     *     description: Generates an image using either a provided custom prompt or by building an enhanced prompt
     *                  from the conversation history associated with a given session ID. The session is deleted after image generation.
     *     tags:
     *       - Enhanced Image
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - sessionId
     *             properties:
     *               sessionId:
     *                 type: string
     *                 description: The ID of the session to retrieve conversation history from.
     *                 example: "user-session-123"
     *               prompt:
     *                 type: string
     *                 description: An optional custom prompt to use for image generation, overriding session history.
     *                 example: "A futuristic city at sunset"
     *     responses:
     *       200:
     *         description: Image successfully generated.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 image:
     *                   type: string
     *                   description: The URL or Base64 string of the generated image.
     *                   example: "https://example.com/generated-image.png"
     *                 prompt:
     *                   type: string
     *                   description: The final prompt used for generation.
     *                   example: "A futuristic city at sunset, highly detailed, cyberpunk style."
     *       400:
     *         description: Bad request, missing sessionId.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "sessionId is required"
     *       404:
     *         description: Session not found for the provided sessionId.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "Session not found"
     *       500:
     *         description: Internal server error during image generation.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "Failed to generate image due to service error."
     */
    generateImage: async (req, res) => {
      try {
        const { sessionId, prompt: customPrompt } = req.body;

        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'sessionId is required',
          });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found',
          });
        }

        // Use custom prompt or build enhanced prompt
        let finalPrompt = customPrompt;
        if (!finalPrompt) {
          const conversationHistory =
            sessionManager.getConversationHistory(sessionId);
          finalPrompt =
            await promptService.buildEnhancedPrompt(conversationHistory);
        }

        const timestamp = Date.now();
        const filename = `image-${sessionId}-${timestamp}.png`;

        // Generate image
        const imageResult = await imageService.generateImage(
          finalPrompt,
          filename
        );

        // Clean up session
        sessionManager.deleteSession(sessionId);

        res.json({
          success: true,
          image: imageResult,
          prompt: finalPrompt,
        });
      } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    /**
     * @swagger
     * /api/images/generate-direct:
     *   post:
     *     summary: Generates an image directly from a provided prompt.
     *     description: Generates an image based solely on the `prompt` provided in the request body,
     *                  without relying on session context or conversation history.
     *     tags:
     *       - Enhanced Image
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
     *                 description: The text prompt to use for image generation.
     *                 example: "A serene landscape with a flowing river and mountains."
     *     responses:
     *       200:
     *         description: Image successfully generated.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 image:
     *                   type: string
     *                   description: The URL or Base64 string of the generated image.
     *                   example: "https://example.com/direct-image.png"
     *                 prompt:
     *                   type: string
     *                   description: The prompt used for generation.
     *                   example: "A serene landscape with a flowing river and mountains."
     *       400:
     *         description: Bad request, missing prompt.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "prompt is required"
     *       500:
     *         description: Internal server error during image generation.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: false
     *                 error:
     *                   type: string
     *                   example: "Failed to generate image directly."
     */
    generateImageDirect: async (req, res) => {
      try {
        const { prompt } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'prompt is required',
          });
        }

        const timestamp = Date.now();
        const filename = `image-direct-${timestamp}.png`;

        // Generate image
        const imageResult = await imageService.generateImage(prompt, filename);

        res.json({
          success: true,
          image: imageResult,
          prompt,
        });
      } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  };
};