import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { LlamaAiController as GroqAiController } from './groq.controller.js';

// Mock express to capture router calls
vi.mock('express', () => {
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: {
      Router: vi.fn().mockImplementation(() => mockRouter),
    },
  };
});

// Mock the auth middleware
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn().mockImplementation(() => (req, res, next) => next()), // Mock auth to return a simple middleware that calls next
}));

// Mock the GroqAiController
vi.mock('./groq.controller.js', () => ({
  LlamaAiController: {
    GroqAiGetResponse: vi.fn(),
    GroqAiGetResponseAnonymously: vi.fn(),
    LlamaAiGetResponseFromDbByUserId: vi.fn(),
    LlamaAiGetResponseFromDbBySessionId: vi.fn(),
    deleteOneAiSession: vi.fn(),
    deleteAllAiSessions: vi.fn(),
  },
}));

// Import the router after mocks are set up
// This will execute the route definitions and call the mocked router methods
import { groqAiRoutes } from './groq.route.js';

describe('Groq AI Routes', () => {
  const mockRouter = express.Router(); // Get the mocked router instance

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Ensure the mockRouter methods are reset
    mockRouter.post.mockClear();
    mockRouter.get.mockClear();
    mockRouter.delete.mockClear();
  });

  it('should export the router instance', () => {
    expect(groqAiRoutes).toBe(mockRouter);
  });

  describe('POST /get-response', () => {
    it('should define a POST route for /get-response with auth middleware and correct controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/get-response',
        expect.any(Function), // auth middleware
        GroqAiController.GroqAiGetResponse
      );
      // Verify auth middleware was called with correct roles
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });
  });

  describe('POST /get-response-anonymously', () => {
    it('should define a POST route for /get-response-anonymously without auth middleware and correct controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/get-response-anonymously',
        GroqAiController.GroqAiGetResponseAnonymously
      );
      // Ensure auth was not called for this route
      const calls = mockRouter.post.mock.calls.filter(call => call[0] === '/get-response-anonymously');
      expect(calls[0].length).toBe(2); // Path and controller, no middleware
    });
  });

  describe('GET /get-response-from-db', () => {
    it('should define a GET route for /get-response-from-db with auth middleware and correct controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/get-response-from-db',
        expect.any(Function), // auth middleware
        GroqAiController.LlamaAiGetResponseFromDbByUserId
      );
      // Verify auth middleware was called with correct roles
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });
  });

  describe('GET /get-response-by-sessionid/:sessionId', () => {
    it('should define a GET route for /get-response-by-sessionid/:sessionId with auth middleware and correct controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/get-response-by-sessionid/:sessionId',
        expect.any(Function), // auth middleware
        GroqAiController.LlamaAiGetResponseFromDbBySessionId
      );
      // Verify auth middleware was called with correct roles
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });
  });

  describe('DELETE /delete-single-response/:objectId', () => {
    it('should define a DELETE route for /delete-single-response/:objectId with auth middleware and correct controller', () => {
      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/delete-single-response/:objectId',
        expect.any(Function), // auth middleware
        GroqAiController.deleteOneAiSession
      );
      // Verify auth middleware was called with correct roles
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });
  });

  describe('DELETE /delete-all-response-from-db', () => {
    it('should define a DELETE route for /delete-all-response-from-db with auth middleware and correct controller', () => {
      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/delete-all-response-from-db',
        expect.any(Function), // auth middleware
        GroqAiController.deleteAllAiSessions
      );
      // Verify auth middleware was called with correct roles
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });
  });

  it('should ensure all expected routes are defined', () => {
    const definedRoutes = [
      '/get-response',
      '/get-response-anonymously',
      '/get-response-from-db',
      '/get-response-by-sessionid/:sessionId',
      '/delete-single-response/:objectId',
      '/delete-all-response-from-db',
    ];

    const allCalledPaths = [
      ...mockRouter.post.mock.calls.map(call => call[0]),
      ...mockRouter.get.mock.calls.map(call => call[0]),
      ...mockRouter.delete.mock.calls.map(call => call[0]),
    ];

    expect(allCalledPaths.sort()).toEqual(definedRoutes.sort());
  });
});