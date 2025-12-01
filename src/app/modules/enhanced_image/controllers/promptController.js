export const createPromptController = (sessionManager, promptService) => {
  return {
    evaluatePrompt: async (req, res) => {
      try {
        const { sessionId, prompt } = req.body;

        if (!sessionId || !prompt) {
          return res.status(400).json({
            success: false,
            error: "sessionId and prompt are required",
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
        console.error("Error evaluating prompt:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    addDetail: async (req, res) => {
      try {
        const { sessionId, detail } = req.body;

        if (!sessionId || !detail) {
          return res.status(400).json({
            success: false,
            error: "sessionId and detail are required",
          });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session not found",
          });
        }

        // Add detail to conversation
        sessionManager.addToHistory(sessionId, detail);
        const history = sessionManager.getHistory(sessionId);
        const conversationHistory = sessionManager.getConversationHistory(sessionId);

        // Re-evaluate quality
        const evaluation = await promptService.evaluatePrompt(
          conversationHistory.join(". "),
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
        console.error("Error adding detail:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    finalizePrompt: async (req, res) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: "sessionId is required",
          });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session not found",
          });
        }

        const conversationHistory = sessionManager.getConversationHistory(sessionId);

        // Build enhanced prompt
        const enhancedPrompt = await promptService.buildEnhancedPrompt(conversationHistory);

        res.json({
          success: true,
          enhancedPrompt,
          conversationHistory,
        });
      } catch (error) {
        console.error("Error finalizing prompt:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  };
};
