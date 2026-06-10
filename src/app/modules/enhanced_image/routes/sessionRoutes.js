import express from 'express';
// AI-Guard: Import enterprise-grade rate limiters for DDOS and abuse protection.
import { startSessionLimiter, deleteSessionLimiter } from '../../../../middleware/rateLimiters.js';
import { createSessionController } from '../controllers/sessionController.js';

/**
 * Creates and configures the Express router for managing enhanced image processing sessions.
 * This router handles the creation and deletion of sessions.
 *
 * @param {import('../services/sessionManager.js').SessionManager} sessionManager - An instance of the SessionManager service to handle session logic.
 * @returns {express.Router} The configured Express router for session-related endpoints.
 */
export const createSessionRoutes = (sessionManager) => {
  const router = express.Router();
  const controller = createSessionController(sessionManager);

  /**
   * @openapi
   * /api/v1/enhanced-image/session/start:
   *   post:
   *     tags:
   *       - Enhanced Image Session
   *     summary: Start a new enhanced image session
   *     description: |
   *       Initializes a new session for enhanced image processing.
   *       This session provides a dedicated context for subsequent image uploads and processing requests.
   *       A unique session ID is returned, which must be used in all following requests within this session.
   *       Requires user authentication.
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       '201':
   *         description: Session created successfully.
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 sessionId:
   *                   type: string
   *                   format: uuid
   *                   description: The unique identifier for the newly created session.
   *                   example: 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
   *       '401':
   *         $ref: '#/components/responses/UnauthorizedError'
   *       '429':
   *         $ref: '#/components/responses/TooManyRequestsError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
  // AI-Guard: Apply a strict rate limit to session creation per user.
  // This prevents authenticated users from spamming session creation, which could exhaust server resources (e.g., memory, database connections).
  router.post('/start', startSessionLimiter, controller.startSession);

  /**
   * @openapi
   * /api/v1/enhanced-image/session/{sessionId}:
   *   delete:
   *     tags:
   *       - Enhanced Image Session
   *     summary: Delete an enhanced image session
   *     description: |
   *       Terminates and cleans up an existing enhanced image processing session.
   *       All resources associated with the session, such as temporary files, will be removed.
   *       Requires user authentication, and the user must be the owner of the session.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: sessionId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: The unique identifier of the session to delete.
   *     responses:
   *       '204':
   *         description: Session deleted successfully. No content is returned.
   *       '401':
   *         $ref: '#/components/responses/UnauthorizedError'
   *       '403':
   *         $ref: '#/components/responses/ForbiddenError'
   *       '404':
   *         description: Session not found. The provided sessionId does not exist or has already been terminated.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       '429':
   *         $ref: '#/components/responses/TooManyRequestsError'
   *       '500':
   *         $ref: '#/components/responses/InternalServerError'
   */
  // AI-Guard: Apply a rate limit to session deletion per user.
  // While less critical than creation, this prevents abuse and unnecessary load from rapid deletion requests.
  router.delete('/:sessionId', deleteSessionLimiter, controller.deleteSession);

  return router;
};