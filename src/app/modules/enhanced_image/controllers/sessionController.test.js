import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSessionController } from './sessionController.js';

describe('createSessionController', () => {
  let mockSessionManager;
  let sessionController;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockSessionManager = {
      createSession: vi.fn(),
      deleteSession: vi.fn(),
    };

    sessionController = createSessionController(mockSessionManager);

    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    mockReq = {
      params: {},
      body: {},
      user: {}, // For role-based access checks, though not used in this controller's logic
    };
  });

  describe('startSession', () => {
    it('should create a new session and return it with a 200 status', () => {
      const mockSessionId = 'new-unique-session-id';
      mockSessionManager.createSession.mockReturnValue(mockSessionId);

      sessionController.startSession(mockReq, mockRes);

      expect(mockSessionManager.createSession).toHaveBeenCalledTimes(1);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        sessionId: mockSessionId,
        message: 'New session started',
      });
    });

    it('should handle errors during session creation and return a 500 status', () => {
      const errorMessage = 'Database connection failed';
      mockSessionManager.createSession.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      sessionController.startSession(mockReq, mockRes);

      expect(mockSessionManager.createSession).toHaveBeenCalledTimes(1);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: errorMessage,
      });
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session and return a 200 status', () => {
      const sessionIdToDelete = 'existing-session-id';
      mockReq.params.sessionId = sessionIdToDelete;
      mockSessionManager.deleteSession.mockReturnValue(true);

      sessionController.deleteSession(mockReq, mockRes);

      expect(mockSessionManager.deleteSession).toHaveBeenCalledTimes(1);
      expect(mockSessionManager.deleteSession).toHaveBeenCalledWith(sessionIdToDelete);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Session deleted',
      });
    });

    it('should return a 404 status if the session to delete is not found', () => {
      const sessionIdToDelete = 'non-existent-session-id';
      mockReq.params.sessionId = sessionIdToDelete;
      mockSessionManager.deleteSession.mockReturnValue(false);

      sessionController.deleteSession(mockReq, mockRes);

      expect(mockSessionManager.deleteSession).toHaveBeenCalledTimes(1);
      expect(mockSessionManager.deleteSession).toHaveBeenCalledWith(sessionIdToDelete);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
    });

    it('should handle errors during session deletion and return a 500 status', () => {
      const sessionIdToDelete = 'error-prone-session-id';
      const errorMessage = 'Filesystem is read-only';
      mockReq.params.sessionId = sessionIdToDelete;
      mockSessionManager.deleteSession.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      sessionController.deleteSession(mockReq, mockRes);

      expect(mockSessionManager.deleteSession).toHaveBeenCalledTimes(1);
      expect(mockSessionManager.deleteSession).toHaveBeenCalledWith(sessionIdToDelete);
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: errorMessage,
      });
    });
  });

  // Note: The provided controller logic does not contain any role-based access checks.
  // Such checks are typically handled by middleware that would run before the controller methods.
  // If role-based logic were present in the controller, tests would be added here.
  // For example:
  // describe('Role-Based Access and Context Boundaries', () => {
  //   it('should allow any authenticated user to start a session', () => {
  //     const roles = ['user', 'manager', 'admin', 'super_admin'];
  //     roles.forEach(role => {
  //       mockReq.user.role = role;
  //       const mockSessionId = `session-for-${role}`;
  //       mockSessionManager.createSession.mockReturnValue(mockSessionId);
  //
  //       sessionController.startSession(mockReq, mockRes);
  //
  //       expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ sessionId: mockSessionId }));
  //       vi.clearAllMocks(); // Reset for next iteration
  //     });
  //   });
  // });
});