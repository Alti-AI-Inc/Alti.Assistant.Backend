import config from '../../../../../config/index.js';
// Performance improvement: Statically import imagen3 service if it's always needed for editImage.
// This avoids the overhead of dynamic import on every request.
import { editImageWithImagen3 } from '../utils/imagen3.service.js';

/**
 * @typedef {object} SessionManager
 * @property {function(string, string): object} getSession - Retrieves a session by ID, scoped to a user.
 * @property {function(string, string): Array<object>} getConversationHistory - Retrieves conversation history for a session, scoped to a user.
 * @property {function(string, string): void} deleteSession - Deletes a session by ID, scoped to a user.
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
 * @typedef {object} UsageService
 * @property {function(object, string): Promise<boolean>} canPerformAction - Checks if a user has sufficient quota for an action.
 * @property {function(object, string, object): Promise<void>} recordAction - Records a user's action for usage tracking.
 * @property {function(object, string, object): Promise<void>} notifyOnThreshold - Notifies admins/managers if usage nears a threshold.
 */

/**
 * @typedef {object} NotificationService
 * @property {function(object, string): Promise<void>} notifyLimitExceeded - Notifies relevant parties that a user has hit a hard usage limit.
 * // This service would also contain methods to be called by other services, e.g., for threshold notifications.
 */


/**
 * Creates an image controller with various image manipulation and generation functionalities.
 * This controller handles requests related to editing existing images and generating new ones,
 * leveraging session management and prompt enhancement services.
 *
 * @param {SessionManager} sessionManager - The session manager instance for handling user sessions.
 * @param {ImageService} imageService - The image service instance for generating images.
 * @param {PromptService} promptService - The prompt service instance for enhancing prompts.
 * @param {UsageService} usageService - The service for tracking and limiting resource usage.
 * @param {NotificationService} notificationService - The service for sending notifications.
 * @returns {object} An object containing controller methods for image operations.
 */
export const createImageController = (
  sessionManager,
  imageService,
  promptService,
  usageService,
  notificationService
) => {
  /**
   * A helper to centralize authentication, authorization, and usage limit checks.
   * This ensures that all image operations are secure and adhere to tenant/workspace limits.
   * @param {object} req - The Express request object, expected to contain `req.user`.
   * @param {object} res - The Express response object.
   * @param {string} actionType - A string identifying the action for usage tracking (e.g., 'image_edit').
   * @returns {Promise<boolean>} - True if the user is authorized and has sufficient usage quota, false otherwise.
   */
  const checkPermissionsAndUsage = async (req, res, actionType) => {
    // INTEGRATION FIX: 1. Authentication Check. Assumes middleware populates req.user.
    if (!req.user || !req.user.id) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return false;
    }

    // CRITICAL INTEGRATION FIX: 2. Authorization Check (Role-based access).
    // Ensures users can only perform actions permitted for their role.
    const requiredRoles = {
        image_edit: ['manager', 'admin', 'super_admin'],
        image_generate: ['user', 'manager', 'admin', 'super_admin'],
        image_generate_direct: ['user', 'manager', 'admin', 'super_admin'],
    };

    const userRole = req.user.role;
    const allowedRoles = requiredRoles[actionType];

    if (!userRole || !allowedRoles || !allowedRoles.includes(userRole)) {
        res.status(403).json({ success: false, error: 'Forbidden: You do not have the required role to perform this action.' });
        return false;
    }


    // INTEGRATION FIX: 3. Usage Limit Check.
    // This respects tenant/workspace boundaries by checking limits for the user's hierarchy.
    const canPerform = await usageService.canPerformAction(req.user, actionType);
    if (!canPerform) {
      res.status(429).json({ success: false, error: 'Usage limit reached. Please contact your administrator.' });
      // Proactively notify the administrator that a user hit their limit.
      // This is a fire-and-forget operation to not delay the user response.
      notificationService.notifyLimitExceeded(req.user, actionType).catch(err => {
        console.error('Failed to send limit exceeded notification:', err);
      });
      return false;
    }

    return true; // All checks passed.
  };

  return {
    /**
     * @swagger
     * /api/images/edit:
     *   post:
     *     summary: Edits an existing image based on a text prompt.
     *     description: Edits an image provided as a Base64 string using a text prompt and the Imagen3 service.
     *                  Requires both a prompt and the image data. This is a protected endpoint and requires authentication.
     *                  Only accessible by roles: manager, admin, super_admin.
     *     tags:
     *       - Enhanced Image
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
     *       401:
     *         description: Unauthorized, authentication token is missing or invalid.
     *       403:
     *         description: Forbidden, user does not have the required role.
     *       429:
     *         description: Too Many Requests, usage limit for the user/workspace has been reached.
     *       500:
     *         description: Internal server error during image editing.
     */
    editImage: async (req, res) => {
      try {
        // CRITICAL FIX: Check permissions and usage limits before proceeding.
        const hasPermission = await checkPermissionsAndUsage(req, res, 'image_edit');
        if (!hasPermission) return; // Response already sent by the helper

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

        const apiKey = config.gemini_secret_key;
        const timestamp = Date.now();
        const filename = `image-edit-${req.user.id}-${timestamp}.png`;

        // Edit image using Imagen3
        const imageResult = await editImageWithImagen3(
          prompt,
          imageBase64,
          filename,
          apiKey
        );

        // CRITICAL FIX: Record the usage after the action is successfully completed.
        // This propagates usage details up the hierarchy (user -> workspace -> tenant).
        await usageService.recordAction(req.user, 'image_edit', {
          promptLength: prompt.length,
          service: 'imagen3',
        });

        // Check if usage is approaching the limit and notify managers/admins if necessary.
        // This is a fire-and-forget operation to not delay the user response.
        usageService.notifyOnThreshold(req.user, 'image_edit', notificationService).catch(err => {
            console.error('Failed to send threshold notification:', err);
        });

        res.json({
          success: true,
          image: imageResult,
          prompt,
        });
      } catch (error) {
        console.error('Error editing image:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to edit image due to an internal error.',
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
     *                  This is a protected endpoint and requires authentication.
     *     tags:
     *       - Enhanced Image
     *     security:
     *       - bearerAuth: []
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
     *       400:
     *         description: Bad request, missing sessionId.
     *       401:
     *         description: Unauthorized, authentication token is missing or invalid.
     *       403:
     *         description: Forbidden, user does not have the required role.
     *       404:
     *         description: Session not found for the provided sessionId and authenticated user.
     *       429:
     *         description: Too Many Requests, usage limit for the user/workspace has been reached.
     *       500:
     *         description: Internal server error during image generation.
     */
    generateImage: async (req, res) => {
      try {
        // CRITICAL FIX: Check permissions and usage limits.
        const hasPermission = await checkPermissionsAndUsage(req, res, 'image_generate');
        if (!hasPermission) return;

        const { sessionId, prompt: customPrompt } = req.body;
        const { user } = req; // Get authenticated user from request.

        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'sessionId is required',
          });
        }

        // CRITICAL FIX (IDOR): Scope session access to the authenticated user.
        // This prevents a user from accessing or deleting another user's session.
        const session = sessionManager.getSession(sessionId, user.id);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found or you do not have permission to access it.',
          });
        }

        // Use custom prompt or build enhanced prompt
        let finalPrompt = customPrompt;
        if (!finalPrompt) {
          // CRITICAL FIX (IDOR): Scope conversation history access to the authenticated user.
          const conversationHistory =
            sessionManager.getConversationHistory(sessionId, user.id);
          finalPrompt =
            await promptService.buildEnhancedPrompt(conversationHistory);
        }

        const timestamp = Date.now();
        const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9-]/g, '_');
        const filename = `image-${sanitizedSessionId}-${timestamp}.png`;

        // Generate image
        const imageResult = await imageService.generateImage(
          finalPrompt,
          filename
        );

        // CRITICAL FIX (IDOR): Scope session deletion to the authenticated user.
        sessionManager.deleteSession(sessionId, user.id);

        // CRITICAL FIX: Record usage and notify if necessary.
        await usageService.recordAction(req.user, 'image_generate', {
          promptLength: finalPrompt.length,
          source: customPrompt ? 'custom' : 'session',
        });
        // This is a fire-and-forget operation to not delay the user response.
        usageService.notifyOnThreshold(req.user, 'image_generate', notificationService).catch(err => {
            console.error('Failed to send threshold notification:', err);
        });

        res.json({
          success: true,
          image: imageResult,
          prompt: finalPrompt,
        });
      } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate image due to an internal error.',
        });
      }
    },

    /**
     * @swagger
     * /api/images/generate-direct:
     *   post:
     *     summary: Generates an image directly from a provided prompt.
     *     description: Generates an image based solely on the `prompt` provided in the request body,
     *                  without relying on session context or conversation history. This is a protected endpoint.
     *     tags:
     *       - Enhanced Image
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
     *                 description: The text prompt to use for image generation.
     *                 example: "A serene landscape with a flowing river and mountains."
     *     responses:
     *       200:
     *         description: Image successfully generated.
     *       400:
     *         description: Bad request, missing prompt.
     *       401:
     *         description: Unauthorized, authentication token is missing or invalid.
     *       403:
     *         description: Forbidden, user does not have the required role.
     *       429:
     *         description: Too Many Requests, usage limit for the user/workspace has been reached.
     *       500:
     *         description: Internal server error during image generation.
     */
    generateImageDirect: async (req, res) => {
      try {
        // CRITICAL FIX: Check permissions and usage limits.
        const hasPermission = await checkPermissionsAndUsage(req, res, 'image_generate_direct');
        if (!hasPermission) return;

        const { prompt } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'prompt is required',
          });
        }

        const timestamp = Date.now();
        const filename = `image-direct-${req.user.id}-${timestamp}.png`;

        // Generate image
        const imageResult = await imageService.generateImage(prompt, filename);

        // CRITICAL FIX: Record usage and notify if necessary.
        await usageService.recordAction(req.user, 'image_generate_direct', {
          promptLength: prompt.length,
        });
        // This is a fire-and-forget operation to not delay the user response.
        usageService.notifyOnThreshold(req.user, 'image_generate_direct', notificationService).catch(err => {
            console.error('Failed to send threshold notification:', err);
        });

        res.json({
          success: true,
          image: imageResult,
          prompt,
        });
      } catch (error) {
        console.error('Error generating image directly:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate image due to an internal error.',
        });
      }
    },
  };
};