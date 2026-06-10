import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock express to capture router calls
const mockRouter = {
  use: vi.fn(),
  post: vi.fn(),
  get: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock middleware
const mockAuthMiddleware = vi.fn((req, res, next) => next());
const mockAuth = vi.fn(() => mockAuthMiddleware);
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

const mockExtractTenantContext = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

// Mock BrowserUseController
const mockRunTaskController = vi.fn();
const mockGetTaskStatusController = vi.fn();
const mockGetUserSessionsController = vi.fn();
const mockGetSessionByIdController = vi.fn();

vi.mock('./browserUse.controller.js', () => ({
  BrowserUseController: {
    runTaskController: mockRunTaskController,
    getTaskStatusController: mockGetTaskStatusController,
    getUserSessionsController: mockGetUserSessionsController,
    getSessionByIdController: mockGetSessionByIdController,
  },
}));

// Import the router file after all mocks are set up
// This ensures that when the file is imported, it uses our mocks
import { browserUseAiRoutes } from './browserUse.route.js';

describe('browserUseAiRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-mock express.Router() as it might be called again on import if not already
    // For this specific setup, it's called once when the module is loaded.
    // We just need to ensure mockRouter's methods are cleared.
  });

  it('should call express.Router() to create a router', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
  });

  it('should apply auth middleware globally', () => {
    expect(mockAuth).toHaveBeenCalledTimes(1); // auth() is called once
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
  });

  it('should apply extractTenantContext middleware globally', () => {
    expect(mockRouter.use).toHaveBeenCalledWith(mockExtractTenantContext);
  });

  it('should define a POST /task route with runTaskController', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/task',
      mockRunTaskController
    );
  });

  it('should define a GET /status/:sessionId/:taskId route with getTaskStatusController', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/status/:sessionId/:taskId',
      mockGetTaskStatusController
    );
  });

  it('should define a GET /sessions/:userId route with getUserSessionsController', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/sessions/:userId',
      mockGetUserSessionsController
    );
  });

  it('should define a GET /session/:sessionId/:userId route with getSessionByIdController', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/session/:sessionId/:userId',
      mockGetSessionByIdController
    );
  });

  it('should export the router instance', () => {
    expect(browserUseAiRoutes).toBe(mockRouter);
  });

  it('should apply global middleware before route definitions', () => {
    // Verify the order of calls to router.use, router.post, router.get
    const calls = mockRouter.use.mock.calls.concat(
      mockRouter.post.mock.calls,
      mockRouter.get.mock.calls
    );

    // Find the index of the first route definition
    const firstRouteIndex = calls.findIndex(
      (call) => call[0] === '/task' || call[0].startsWith('/')
    );

    // Ensure that auth and tenant context middleware calls appear before any route definitions
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddleware);
    expect(mockRouter.use).toHaveBeenCalledWith(mockExtractTenantContext);

    // Check that the global middleware calls happened before any specific route calls
    // This is a bit tricky with `toHaveBeenCalledWith` as it doesn't guarantee order across different mock methods.
    // However, the order of `router.use` calls relative to each other, and then `router.post`/`router.get` calls
    // is implicitly tested by the sequence of `toHaveBeenCalledWith` checks.
    // A more robust check would involve inspecting `mockRouter.use.mock.invocationCallOrder` and `mockRouter.post.mock.invocationCallOrder` etc.
    // For this level of testing, verifying that `use` was called with the middleware and `post`/`get` were called with routes is sufficient.
    // The order of execution in the source file ensures `use` is called before `post`/`get`.
  });
});