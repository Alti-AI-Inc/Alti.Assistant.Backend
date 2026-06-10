import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock express and its Router method
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  use: vi.fn(), // In case .use is ever called, though not in this file
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock controller functions
const mockComposioSimpleController = {
  chatController: vi.fn(),
  initiateAuthController: vi.fn(),
  waitForConnectionController: vi.fn(),
  getConversationsController: vi.fn(),
  getConversationController: vi.fn(),
  getConnectedAccountsController: vi.fn(),
  disconnectAppController: vi.fn(),
  getAppCapabilitiesController: vi.fn(),
  connectionStatusStreamController: vi.fn(),
  compareController: vi.fn(),
};
vi.mock('./composio.controller.js', () => ({
  composioSimpleController: mockComposioSimpleController,
}));

// Mock auth middleware
const mockAuthMiddleware = vi.fn((req, res, next) => next());
const mockAuth = vi.fn(() => mockAuthMiddleware);
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

// Mock checkDailyRequestLimit middleware
const mockCheckDailyRequestLimit = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

// Import the module under test AFTER all mocks are set up
// This will trigger the router setup with the mocked dependencies
import { composioSimpleRoutes } from './composio.route.js';

describe('composioSimpleRoutes', () => {
  beforeEach(() => {
    // Clear all mock calls before each test to ensure isolation
    mockRouter.get.mockClear();
    mockRouter.post.mockClear();
    mockRouter.use.mockClear();
    mockAuth.mockClear();
    mockAuthMiddleware.mockClear();
    mockCheckDailyRequestLimit.mockClear();
    Object.values(mockComposioSimpleController).forEach(mockFn => mockFn.mockClear());
  });

  it('should export an express router instance', () => {
    expect(composioSimpleRoutes).toBe(mockRouter);
    expect(express.Router).toHaveBeenCalledTimes(1);
  });

  describe('POST /chat', () => {
    it('should define the /chat POST route with auth, checkDailyRequestLimit, and chatController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/chat',
        mockAuthMiddleware,
        mockCheckDailyRequestLimit,
        mockComposioSimpleController.chatController
      );
      expect(mockAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authentication Endpoints', () => {
    it('should define the /initiate POST route with auth and initiateAuthController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/initiate',
        mockAuthMiddleware,
        mockComposioSimpleController.initiateAuthController
      );
      expect(mockAuth).toHaveBeenCalledTimes(2); // Called for /chat and /initiate
    });

    it('should define the /wait-for-connection POST route with auth and waitForConnectionController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/wait-for-connection',
        mockAuthMiddleware,
        mockComposioSimpleController.waitForConnectionController
      );
      expect(mockAuth).toHaveBeenCalledTimes(3); // Called for /chat, /initiate, and /wait-for-connection
    });
  });

  describe('Conversation Endpoints', () => {
    it('should define the /conversations GET route with auth and getConversationsController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/conversations',
        mockAuthMiddleware,
        mockComposioSimpleController.getConversationsController
      );
      expect(mockAuth).toHaveBeenCalledTimes(4); // Called for previous routes + /conversations
    });

    it('should define the /conversation/:conversationId GET route with auth and getConversationController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/conversation/:conversationId',
        mockAuthMiddleware,
        mockComposioSimpleController.getConversationController
      );
      expect(mockAuth).toHaveBeenCalledTimes(5); // Called for previous routes + /conversation/:conversationId
    });
  });

  describe('Connected Accounts Endpoints', () => {
    it('should define the /connected-accounts GET route with auth and getConnectedAccountsController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/connected-accounts',
        mockAuthMiddleware,
        mockComposioSimpleController.getConnectedAccountsController
      );
      expect(mockAuth).toHaveBeenCalledTimes(6); // Called for previous routes + /connected-accounts
    });

    it('should define the /disconnect POST route with auth and disconnectAppController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/disconnect',
        mockAuthMiddleware,
        mockComposioSimpleController.disconnectAppController
      );
      expect(mockAuth).toHaveBeenCalledTimes(7); // Called for previous routes + /disconnect
    });

    it('should define the /app-capabilities GET route with auth and getAppCapabilitiesController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/app-capabilities',
        mockAuthMiddleware,
        mockComposioSimpleController.getAppCapabilitiesController
      );
      expect(mockAuth).toHaveBeenCalledTimes(8); // Called for previous routes + /app-capabilities
    });

    it('should define the /connection-status-stream GET route with auth and connectionStatusStreamController', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/connection-status-stream',
        mockAuthMiddleware,
        mockComposioSimpleController.connectionStatusStreamController
      );
      expect(mockAuth).toHaveBeenCalledTimes(9); // Called for previous routes + /connection-status-stream
    });
  });

  describe('Comparison Endpoint', () => {
    it('should define the /compare POST route with auth and compareController', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/compare',
        mockAuthMiddleware,
        mockComposioSimpleController.compareController
      );
      expect(mockAuth).toHaveBeenCalledTimes(10); // Called for previous routes + /compare
    });
  });

  it('should ensure all controller methods are referenced in the router', () => {
    // This test ensures that if a new controller method is added, it's also added to the router
    const expectedControllerCalls = [
      mockComposioSimpleController.chatController,
      mockComposioSimpleController.initiateAuthController,
      mockComposioSimpleController.waitForConnectionController,
      mockComposioSimpleController.getConversationsController,
      mockComposioSimpleController.getConversationController,
      mockComposioSimpleController.getConnectedAccountsController,
      mockComposioSimpleController.disconnectAppController,
      mockComposioSimpleController.getAppCapabilitiesController,
      mockComposioSimpleController.connectionStatusStreamController,
      mockComposioSimpleController.compareController,
    ];

    const allRouterCalls = [
      ...mockRouter.get.mock.calls.flat(),
      ...mockRouter.post.mock.calls.flat(),
    ];

    expectedControllerCalls.forEach(controller => {
      expect(allRouterCalls).toContain(controller);
    });
  });

  it('should ensure auth() is called for every route', () => {
    // There are 10 routes in total, and each calls auth() once.
    expect(mockAuth).toHaveBeenCalledTimes(10);
  });

  it('should ensure checkDailyRequestLimit is only called for the /chat route', () => {
    expect(mockCheckDailyRequestLimit).toHaveBeenCalledTimes(1);
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/chat',
      mockAuthMiddleware,
      mockCheckDailyRequestLimit,
      mockComposioSimpleController.chatController
    );
  });
});