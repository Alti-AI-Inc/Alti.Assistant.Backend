export const createSessionController = (sessionManager) => {
  return {
    startSession: (req, res) => {
      try {
        const sessionId = sessionManager.createSession();

        res.json({
          success: true,
          sessionId,
          message: 'New session started',
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    deleteSession: (req, res) => {
      try {
        const { sessionId } = req.params;

        if (sessionManager.deleteSession(sessionId)) {
          res.json({
            success: true,
            message: 'Session deleted',
          });
        } else {
          res.status(404).json({
            success: false,
            error: 'Session not found',
          });
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  };
};
