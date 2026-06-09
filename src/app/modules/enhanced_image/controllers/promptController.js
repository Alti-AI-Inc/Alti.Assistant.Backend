/**
 * @typedef {object} PromptEvaluationResult
 * @property {boolean} isComplete - Indicates if the prompt is considered complete.
 * @property {number} score - A numerical score representing the prompt's quality.
 * @property {string[]} missingElements - A list of elements identified as missing from the prompt.
 * @property {string[]} suggestions - Suggestions for improving the prompt.
 */

/**
 * @typedef {object} PromptService
 * @property {(prompt: string, history: string[]) => Promise<PromptEvaluationResult>} evaluatePrompt - Evaluates the quality of a given prompt.
 * @property {(conversationHistory: string[]) => Promise<string>} buildEnhancedPrompt - Builds an enhanced prompt from a conversation history.
 */

/**
 * @typedef {object} SessionManager
 * @property {(sessionId: string) => object | undefined} getSession - Retrieves a session by its ID.
 * @property {() => string} createSession - Creates a new session and returns its ID.
 * @property {(sessionId: string, message: string) => void} addToHistory - Adds a message to the conversation history of a session.
 * @property {(sessionId: string) => string[]} getHistory - Retrieves the raw history of a session.
 * @property {(sessionId: string) => string[]} getConversationHistory - Retrieves the formatted conversation history of a session.
 */

/**
 * Factory function to create prompt controller methods.
 * This controller handles operations related to evaluating, enhancing, and finalizing user prompts
 * within a conversational context. It interacts with a session manager to maintain state
 * and a prompt service for core prompt logic.
 *
 * @param {SessionManager} sessionManager - The session manager instance to handle conversation state.
 * @param {PromptService} promptService - The prompt service instance for prompt evaluation and enhancement.
 * @returns {object} An object containing controller methods for prompt operations.
 */
export const createPromptController = (sessionManager, promptService) => {
  return {
    /**
     * @openapi
     * /api/enhanced-image/prompt/evaluate:
     *   post:
     *     summary: Evaluate an initial prompt or a new turn in a conversation.
     *     description: Evaluates the quality of a user-provided prompt, potentially creating a new session if none exists, and returns an evaluation along with the updated conversation history.
     *     tags:
     *       - Prompt Evaluation
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - sessionId
     *               - prompt
     *             properties:
     *               sessionId:
     *                 type: string
     *                 description: The ID of the current session. A new session will be created if this ID is not found.
     *                 example: "some-unique-session-id"
     *               prompt:
     *                 type: string
     *                 description: The prompt text to be evaluated.
     *                 example: "A futuristic city at sunset"
     *     responses:
     *       200:
     *         description: Prompt evaluated successfully.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 evaluation:
     *                   type: object
     *                   properties:
     *                     isComplete:
     *                       type: boolean
     *                       description: Indicates if the prompt is considered complete.
     *                       example: false
     *                     score:
     *                       type: number
     *                       description: A numerical score representing the prompt's quality.
     *                       example: 75
     *                     missingElements:
     *                       type: array
     *                       items:
     *                         type: string
     *                       description: A list of elements identified as missing from the prompt.
     *                       example: ["style", "mood"]
     *                     suggestions:
     *                       type: array
     *                       items:
     *                         type: string
     *                       description: Suggestions for improving the prompt.
     *                       example: ["Consider adding a specific art style.", "Describe the mood of the city."]
     *                 conversationHistory:
     *                   type: array
     *                   items:
     *                     type: string
     *                   description: The updated conversation history for the session.
     *                   example: ["A futuristic city at sunset"]
     *       400:
     *         description: Bad Request - Missing sessionId or prompt.
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
     *                   example: "sessionId and prompt are required"
     *       500:
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
     *                   example: "Error evaluating prompt: Something went wrong."
     */
    evaluatePrompt: async (req, res) => {
      try {
        const { sessionId, prompt } = req.body;

        if (!sessionId || !prompt) {
          return res.status(400).json({
            success: false,
            error: 'sessionId and prompt are required',
          });
        }

        let session = sessionManager.getSession(sessionId);
        if (!session) {
          // Create new session if not found
          sessionManager.createSession();
          session = sessionManager.getSession(sessionId);
        }

        // Add prompt to conversation history
        sessionManager.addToHistory(sessionId, prompt);
        const history = sessionManager.getHistory(sessionId);

        // Evaluate prompt quality
        const evaluation = await promptService.evaluatePrompt(prompt, history);

        res.json({
          success: true,
          evaluation: {
            isComplete: evaluation.isComplete,
            score: evaluation.score,
            missingElements: evaluation.missingElements,
            suggestions: evaluation.suggestions,
          },
          conversationHistory: sessionManager.getConversationHistory(sessionId),
        });
      } catch (error) {
        console.error('Error evaluating prompt:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    /**
     * @openapi
     * /api/enhanced-image/prompt/add-detail:
     *   post:
     *     summary: Add a new detail to an existing conversation and re-evaluate the prompt.
     *     description: Appends a new detail to the conversation history for a given session and then re-evaluates the overall prompt quality based on the updated history.
     *     tags:
     *       - Prompt Evaluation
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - sessionId
     *               - detail
     *             properties:
     *               sessionId:
     *                 type: string
     *                 description: The ID of the current session.
     *                 example: "some-unique-session-id"
     *               detail:
     *                 type: string
     *                 description: The new detail to add to the conversation.
     *                 example: "The city should have flying cars and neon lights."
     *     responses:
     *       200:
     *         description: Detail added and prompt re-evaluated successfully.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 evaluation:
     *                   type: object
     *                   properties:
     *                     isComplete:
     *                       type: boolean
     *                       description: Indicates if the prompt is considered complete after adding the detail.
     *                       example: true
     *                     score:
     *                       type: number
     *                       description: The updated numerical score representing the prompt's quality.
     *                       example: 90
     *                     missingElements:
     *                       type: array
     *                       items:
     *                         type: string
     *                       description: A list of elements still identified as missing.
     *                       example: []
     *                     suggestions:
     *                       type: array
     *                       items:
     *                         type: string
     *                       description: Further suggestions for improvement.
     *                       example: []
     *                 conversationHistory:
     *                   type: array
     *                   items:
     *                     type: string
     *                   description: The updated conversation history for the session.
     *                   example: ["A futuristic city at sunset", "The city should have flying cars and neon lights."]
     *       400:
     *         description: Bad Request - Missing sessionId or detail.
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
     *                   example: "sessionId and detail are required"
     *       404:
     *         description: Not Found - Session not found.
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
     *                   example: "Error adding detail: Something went wrong."
     */
    addDetail: async (req, res) => {
      try {
        const { sessionId, detail } = req.body;

        if (!sessionId || !detail) {
          return res.status(400).json({
            success: false,
            error: 'sessionId and detail are required',
          });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found',
          });
        }

        // Add detail to conversation
        sessionManager.addToHistory(sessionId, detail);
        const history = sessionManager.getHistory(sessionId);
        const conversationHistory =
          sessionManager.getConversationHistory(sessionId);

        // Re-evaluate quality
        const evaluation = await promptService.evaluatePrompt(
          conversationHistory.join('. '),
          history
        );

        res.json({
          success: true,
          evaluation: {
            isComplete: evaluation.isComplete,
            score: evaluation.score,
            missingElements: evaluation.missingElements,
            suggestions: evaluation.suggestions,
          },
          conversationHistory,
        });
      } catch (error) {
        console.error('Error adding detail:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    /**
     * @openapi
     * /api/enhanced-image/prompt/finalize:
     *   post:
     *     summary: Finalize the prompt based on the conversation history.
     *     description: Builds a comprehensive, enhanced prompt from the entire conversation history of a given session, suitable for further processing (e.g., image generation).
     *     tags:
     *       - Prompt Finalization
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
     *                 description: The ID of the session whose conversation history will be used to finalize the prompt.
     *                 example: "some-unique-session-id"
     *     responses:
     *       200:
     *         description: Prompt finalized successfully.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 enhancedPrompt:
     *                   type: string
     *                   description: The final, enhanced prompt generated from the conversation history.
     *                   example: "A vibrant futuristic city at sunset, with flying cars, neon lights, and a bustling atmosphere."
     *                 conversationHistory:
     *                   type: array
     *                   items:
     *                     type: string
     *                   description: The complete conversation history used to build the enhanced prompt.
     *                   example: ["A futuristic city at sunset", "The city should have flying cars and neon lights."]
     *       400:
     *         description: Bad Request - Missing sessionId.
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
     *         description: Not Found - Session not found.
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
     *                   example: "Error finalizing prompt: Something went wrong."
     */
    finalizePrompt: async (req, res) => {
      try {
        const { sessionId } = req.body;

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

        const conversationHistory =
          sessionManager.getConversationHistory(sessionId);

        // Build enhanced prompt
        const enhancedPrompt =
          await promptService.buildEnhancedPrompt(conversationHistory);

        res.json({
          success: true,
          enhancedPrompt,
          conversationHistory,
        });
      } catch (error) {
        console.error('Error finalizing prompt:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  };
};