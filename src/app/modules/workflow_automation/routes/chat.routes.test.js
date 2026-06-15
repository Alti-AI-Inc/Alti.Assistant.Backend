import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock dependencies
const mockAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next());

const {
  mockAuth,
  mockOptionalAuth,
  mockCheckDailyRequestLimit,
  mockChatController,
  mockRouter
} = vi.hoisted(() => {
  const mockAuth = vi.fn().mockImplementation(() => mockAuthMiddleware);

  const mockOptionalAuth = vi.fn().mockImplementation(() => mockOptionalAuthMiddleware);

  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());

  const mockChatController = {
    createWorkflowFromPromptController: vi.fn(),
    confirmWorkflowCreationController: vi.fn(),
    continueConversationController: vi.fn(),
    getUserConversationsController: vi.fn(),
    getConversationController: vi.fn(),
  };

  // Mock express.Router
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
  };

  return {
    mockAuth,
    mockOptionalAuth,
    mockCheckDailyRequestLimit,
    mockChatController,
    mockRouter
  };
});

const mockOptionalAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next());

// Mock the express module to return our mock router when Router() is called
vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

// Mock the middleware modules
vi.mock('../../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

vi.mock('../../../middlewares/auth/optionalAuth.js', () => ({
  default: mockOptionalAuth,
}));

vi.mock('../../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

// Mock the chat controller module
vi.mock('../controllers/chat.controller.js', () => ({
  chatController: mockChatController,
}));

// Import the file under test AFTER all mocks are set up
// Assuming the test file is in the same directory as the routes file
import { chatRoutes } from './chat.routes.js';

describe('chat.routes.js', () => {
  beforeEach(() => {
    // Clear all mock calls before each test to ensure isolation
    vi.clearAllMocks();
    // Re-mock express.Router to ensure a fresh router for each test if needed,
    // but in this case, the `chatRoutes` import happens once, so `express.Router()` is called once.
    // We just need to ensure `mockRouter.post` and `mockRouter.get` calls are cleared.
  });

  it('should export the router instance', () => {
    expect(chatRoutes).toBe(mockRouter);
  });

  describe('POST /create', () => {
    it('should define the POST /create route with optionalAuth, checkDailyRequestLimit, and createWorkflowFromPromptController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/create',
        mockOptionalAuthMiddleware,
        mockCheckDailyRequestLimit,
        mockChatController.createWorkflowFromPromptController
      );
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1); // Ensure optionalAuth() was called to get the middleware
    });
  });

  describe('POST /confirm', () => {
    it('should define the POST /confirm route with optionalAuth, checkDailyRequestLimit, and confirmWorkflowCreationController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/confirm',
        mockOptionalAuthMiddleware,
        mockCheckDailyRequestLimit,
        mockChatController.confirmWorkflowCreationController
      );
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /continue', () => {
    it('should define the POST /continue route with optionalAuth, checkDailyRequestLimit, and continueConversationController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/continue',
        mockOptionalAuthMiddleware,
        mockCheckDailyRequestLimit,
        mockChatController.continueConversationController
      );
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /conversations', () => {
    it('should define the GET /conversations route with optionalAuth and getUserConversationsController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/conversations',
        mockOptionalAuthMiddleware,
        mockChatController.getUserConversationsController
      );
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /conversations/:conversationId', () => {
    it('should define the GET /conversations/:conversationId route with optionalAuth and getConversationController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/conversations/:conversationId',
        mockOptionalAuthMiddleware,
        mockChatController.getConversationController
      );
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('should ensure optionalAuth() is called for each route that uses it', () => {
    // The `chatRoutes` import is executed once, defining all routes.
    // We expect optionalAuth() to be called 5 times in total, once for each route.
    expect(mockOptionalAuth).toHaveBeenCalledTimes(5);
  });

  it('should ensure checkDailyRequestLimit is applied to the correct routes', () => {
    // checkDailyRequestLimit is applied to /create, /confirm, /continue (3 routes)
    // We check if it was passed as an argument to router.post for these routes.
    // The mockRouter.post calls are already checked in individual route tests.
    // This test ensures it's not accidentally applied to GET routes.
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/create',
      expect.any(Function), // optionalAuthMiddleware
      mockCheckDailyRequestLimit,
      expect.any(Function) // controller
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/confirm',
      expect.any(Function), // optionalAuthMiddleware
      mockCheckDailyRequestLimit,
      expect.any(Function) // controller
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/continue',
      expect.any(Function), // optionalAuthMiddleware
      mockCheckDailyRequestLimit,
      expect.any(Function) // controller
    );

    // Ensure it's NOT called for GET routes
    expect(mockRouter.get).not.toHaveBeenCalledWith(
      expect.any(String),
      mockCheckDailyRequestLimit,
      expect.any(Function)
    );
  });
});