import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { QwenAiController } from './qwen.controller.js';

const {
  mockRouter
} = vi.hoisted(() => {
  // Mock express to capture router calls
  const mockRouter = {
    post: vi.fn(),
  };

  return {
    mockRouter
  };
});
vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

// Mock auth middleware
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn().mockImplementation((...roles) => (req, res, next) => {
    // This mock middleware just calls next to simulate passing through
    // In a real scenario, you might want to test its behavior more deeply
    // but for route testing, we just need to confirm it's called with correct args.
    next();
  }),
}));

// Mock QwenAiController methods
vi.mock('./qwen.controller.js', () => ({
  QwenAiController: {
    QwenAiGetResponse: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'Mocked Coder Response' })),
    QwenQWQAiGetResponse: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'Mocked QWQ Response' })),
  },
}));

// Import the module under test AFTER mocks are set up
import { qwenAiRoutes } from './qwen.route.js';

describe('Qwen AI Routes', () => {
  it('should initialize express router', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(qwenAiRoutes).toBe(mockRouter);
  });

  describe('POST /coder/get-response', () => {
    it('should define a POST route for /coder/get-response', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/coder/get-response',
        expect.any(Function), // auth middleware
        expect.any(Function)  // QwenAiController.QwenAiGetResponse
      );
    });

    it('should apply auth middleware with ADMIN and USER roles', () => {
      // Find the call to mockRouter.post for this specific route
      const coderRouteCall = mockRouter.post.mock.calls.find(
        call => call[0] === '/coder/get-response'
      );
      expect(coderRouteCall).toBeDefined();

      // The second argument should be the auth middleware
      const authMiddleware = coderRouteCall[1];
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
      expect(authMiddleware).toBeInstanceOf(Function); // Ensure it's a function returned by auth
    });

    it('should use QwenAiController.QwenAiGetResponse as the handler', () => {
      const coderRouteCall = mockRouter.post.mock.calls.find(
        call => call[0] === '/coder/get-response'
      );
      expect(coderRouteCall).toBeDefined();
      expect(coderRouteCall[2]).toBe(QwenAiController.QwenAiGetResponse);
    });
  });

  describe('POST /qwq/get-response', () => {
    it('should define a POST route for /qwq/get-response', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/qwq/get-response',
        expect.any(Function), // auth middleware
        expect.any(Function)  // QwenAiController.QwenQWQAiGetResponse
      );
    });

    it('should apply auth middleware with ADMIN and USER roles', () => {
      const qwqRouteCall = mockRouter.post.mock.calls.find(
        call => call[0] === '/qwq/get-response'
      );
      expect(qwqRouteCall).toBeDefined();

      const authMiddleware = qwqRouteCall[1];
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
      expect(authMiddleware).toBeInstanceOf(Function);
    });

    it('should use QwenAiController.QwenQWQAiGetResponse as the handler', () => {
      const qwqRouteCall = mockRouter.post.mock.calls.find(
        call => call[0] === '/qwq/get-response'
      );
      expect(qwqRouteCall).toBeDefined();
      expect(qwqRouteCall[2]).toBe(QwenAiController.QwenQWQAiGetResponse);
    });
  });
});