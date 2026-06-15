import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { usageController } from './usage.controller.js';

const {
  mockRouter,
  mockAuthMiddleware,
  mockExtractTenantContext,
  mockGetUsageStats
} = vi.hoisted(() => {
  // Mock express and its Router
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(),
  };

  // Mock middleware and controller
  const mockAuthMiddleware = vi.fn().mockImplementation(() => vi.fn()); // auth() returns a middleware function
  const mockExtractTenantContext = vi.fn();
  const mockGetUsageStats = vi.fn();

  return {
    mockRouter,
    mockAuthMiddleware,
    mockExtractTenantContext,
    mockGetUsageStats
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuthMiddleware,
}));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));
vi.mock('./usage.controller.js', () => ({
  usageController: {
    getUsageStats: mockGetUsageStats,
  },
}));

// Import the module under test AFTER mocks are defined
// This ensures that when usage.route.js is imported, it uses our mocked dependencies.
import { usageRoutes } from './usage.route.js';

describe('Usage Routes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-initialize mockAuthMiddleware to return a fresh mock function
    mockAuthMiddleware.mockReturnValue(vi.fn());
  });

  it('should define the /stats GET route with correct middleware and handler', () => {
    // Ensure the router was created
    expect(express.Router).toHaveBeenCalledTimes(1);

    // Check that router.get was called
    expect(mockRouter.get).toHaveBeenCalledTimes(1);

    // Get the arguments passed to router.get
    const [path, ...middleware] = mockRouter.get.mock.calls[0];

    // Assert the path
    expect(path).toBe('/stats');

    // Assert the middleware chain
    expect(middleware).toHaveLength(3);

    // Assert auth() middleware
    expect(mockAuthMiddleware).toHaveBeenCalledTimes(1); // auth() should have been called to get the middleware
    expect(middleware[0]).toBe(mockAuthMiddleware()); // The first middleware should be the result of auth()

    // Assert extractTenantContext middleware
    expect(middleware[1]).toBe(mockExtractTenantContext);

    // Assert getUsageStats handler
    expect(middleware[2]).toBe(mockGetUsageStats);

    // Ensure that the exported router is the mockRouter
    expect(usageRoutes).toBe(mockRouter);
  });
});