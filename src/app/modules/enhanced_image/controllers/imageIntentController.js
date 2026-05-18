import config from '../../../../../config/index.js';

export const createImageIntentController = (sessionManager) => {
  return {
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
