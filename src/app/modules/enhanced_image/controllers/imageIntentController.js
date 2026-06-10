import config from '../../../../../config/index.js';

/**
 * Factory function to create the image intent controller.
 * This controller handles the analysis of user requests to determine their intent
 * regarding image generation or editing.
 * @param {object} sessionManager - An instance of the session manager to handle user session context.
 * @returns {object} The image intent controller object with its methods.
 */
export const createImageIntentController = (sessionManager) => {
  return {
    /**
     * @openapi
     * /api/v1/image/intent/analyze:
     *   post:
     *     tags:
     *       - Image Intent
     *     summary: Analyze user intent for image generation or editing
     *     description: >
     *       Analyzes a user's text request, along with session context and whether an image is present,
     *       to determine if the intent is to generate a new image, edit an existing one, or if more
     *       information is needed.
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               sessionId:
     *                 type: string
     *                 description: The unique identifier for the user's session to retrieve conversation context.
     *                 example: 'session-12345'
     *               request:
     *                 type: string
     *                 description: The user's request message. Use this or 'userMessage'.
     *                 example: 'Can you make the sky blue?'
     *               userMessage:
     *                 type: string
     *                 description: The user's request message. An alternative to 'request'.
     *                 example: 'Generate a picture of a cat on a skateboard.'
     *               hasImage:
     *                 type: boolean
     *                 description: A flag indicating if an image is associated with the request.
     *                 default: false
     *                 example: true
     *             anyOf:
     *               - required: [request]
     *               - required: [userMessage]
     *     responses:
     *       '200':
     *         description: Intent analysis successful.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 isEditable:
     *                   type: boolean
     *                   description: Indicates if the intent is to edit an existing image.
     *                   example: true
     *                 intent:
     *                   type: string
     *                   description: The primary intent identified (e.g., 'edit', 'generate', 'clarify').
     *                   example: 'edit'
     *                 editType:
     *                   type: string
     *                   description: The specific type of edit requested (e.g., 'color_change', 'object_addition').
     *                   example: 'color_change'
     *                 reasoning:
     *                   type: string
     *                   description: An explanation of how the intent was determined.
     *                   example: "The user mentioned 'make the sky blue', which is a color change request."
     *                 needsMoreInfo:
     *                   type: boolean
     *                   description: Indicates if the AI needs more information to fulfill the request.
     *                   example: false
     *                 questions:
     *                   type: array
     *                   items:
     *                     type: string
     *                   description: A list of clarifying questions for the user if more info is needed.
     *                   example: []
     *       '400':
     *         description: Bad Request - 'request' or 'userMessage' is required in the request body.
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
     *                   example: 'request or userMessage is required'
     *       '500':
     *         description: Internal Server Error.
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
     *                   example: 'An internal error occurred.'
     */
    /**
     * Analyzes the user's intent for image generation or editing based on their message and session context.
     * @param {import('express').Request} req - The Express request object.
     * @param {object} req.body - The request body.
     * @param {string} [req.body.sessionId] - The session ID to retrieve conversation history.
     * @param {string} [req.body.request] - The user's text prompt.
     * @param {string} [req.body.userMessage] - Alternative to 'request'.
     * @param {boolean} [req.body.hasImage=false] - Whether an image is included in the context.
     * @param {import('express').Response} res - The Express response object.
     * @returns {Promise<void>}
     */
    analyzeIntent: async (req, res) => {
      try {
        const { sessionId, request, userMessage, hasImage } = req.body;

        // Accept either 'request' or 'userMessage'
        const userRequest = request || userMessage;

        if (!userRequest) {
          return res.status(400).json({
            success: false,
            error: 'request or userMessage is required',
          });
        }

        // Get session context if sessionId provided
        let context = 'No previous context.';
        if (sessionId) {
          const session = sessionManager.getSession(sessionId);
          if (session) {
            context =
              sessionManager.getHistory(sessionId) || 'No previous context.';
          }
        }

        // Import here to avoid circular dependencies
        const { analyzeImageIntent } = await import(
          '../utils/imageIntentAnalyzer.js'
        );
        const apiKey = config.gemini_secret_key;

        // Analyze intent
        const analysis = await analyzeImageIntent(
          userRequest,
          hasImage || false,
          context,
          { apiKey }
        );

        res.json({
          success: true,
          isEditable: analysis.isEditable,
          intent: analysis.intent,
          editType: analysis.editType,
          reasoning: analysis.reasoning,
          needsMoreInfo: analysis.needsMoreInfo,
          questions: analysis.questions,
        });
      } catch (error) {
        console.error('Error analyzing image intent:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  };
};