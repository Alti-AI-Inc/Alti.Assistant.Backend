/**
 * @file Controller for managing image processing sessions.
 * @module app/modules/enhanced_image/controllers/sessionController
 */

/**
 * Creates a session controller instance.
 * This factory function takes a session manager and returns an object
 * containing methods to handle session-related HTTP requests.
 *
 * @param {object} sessionManager - An instance of a session manager responsible for creating and deleting sessions.
 * @param {function(): string} sessionManager.createSession - Function to create a new unique session ID.
 * @param {function(string): boolean} sessionManager.deleteSession - Function to delete a session by its ID.
 * @returns {object} An object containing controller methods for session management.
 * @returns {function(import('express').Request, import('express').Response): void} startSession - Handles starting a new session.
 * @returns {function(import('express').Request, import('express').Response): void} deleteSession - Handles deleting an existing session.
 */
export const createSessionController = (sessionManager) => {
  return {
    /**
     * Handles the request to start a new image processing session.
     * This endpoint creates a unique session ID and returns it to the client.
     *
     * @swagger
     * /api/v1/sessions:
     *   post:
     *     summary: Start a new image processing session
     *     description: Creates a unique session ID for subsequent image processing operations.
     *     tags:
     *       - Session Management
     *     responses:
     *       200:
     *         description: New session started successfully.
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 success:
     *                   type: boolean
     *                   example: true
     *                 sessionId:
     *                   type: string
     *                   description: The unique ID of the newly created session.
     *                   example: "a1b2c3d4e5f6g7h8i9j0"
     *                 message:
     *                   type: string
     *                   example: "New session started"
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
     *                 error:
     *                   type: string
     *                   example: "Failed to create session"
     * @param {import('express').Request} req - The Express request object.
     * @param {import('express').Response} res - The Express response object.
     * @returns {void}
     */
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

    /**
     * Handles the request to delete an existing image processing session.
     * This endpoint invalidates a session identified by its ID.
     *
     * @swagger
     * /api/v1/sessions/{sessionId}:
     *   delete:
     *     summary: Delete an existing image processing session
     *     description: Deletes a session identified by the provided sessionId, invalidating it for further use.
     *     tags:
     *       - Session Management
     *     parameters:
     *       - in: path
     *         name: sessionId
     *         schema:
     *           type: string
     *         required: true
     *         description: The unique ID of the session to delete.
     *         example: "a1b2c3d4e5f6g7h8i9j0"
     *     responses:
     *       200:
     *         description: Session deleted successfully.
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
     *                   example: "Session deleted"
     *       404:
     *         description: Session not found.
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
     *         description: Internal server error.
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
     *                   example: "Failed to delete session"
     * @param {import('express').Request} req - The Express request object, containing `sessionId` in `req.params`.
     * @param {import('express').Response} res - The Express response object.
     * @returns {void}
     */
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