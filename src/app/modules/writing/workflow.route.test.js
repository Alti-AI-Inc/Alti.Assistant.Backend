import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockPost = vi.fn();

const {
  mockRouter,
  mockWritingController,
  mockOptionalAuth,
  mockExtractTenantContext,
  mockCheckDailyRequestLimit
} = vi.hoisted(() => {
  const mockRouter = {
    post: mockPost,
  };

  const mockWritingController = vi.fn();

  const mockOptionalAuth = vi.fn().mockImplementation(() => 'optionalAuthMiddleware');

  const mockExtractTenantContext = vi.fn();

  const mockCheckDailyRequestLimit = vi.fn();

  return {
    mockRouter,
    mockWritingController,
    mockOptionalAuth,
    mockExtractTenantContext,
    mockCheckDailyRequestLimit
  };
});

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

vi.mock('./writer.controller.js', () => ({
  default: mockWritingController,
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: mockOptionalAuth,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

describe('Writing Workflow Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should configure the POST /assistant route with the correct middlewares and controller', async () => {
    // Dynamically import the router file to ensure mocks are applied
    await import('./workflow.route.js');

    // Check that the router's post method was called
    expect(mockPost).toHaveBeenCalledOnce();

    // Check the arguments of the post method call
    const postCallArgs = mockPost.mock.calls[0];
    
    // 1. Check the route path
    expect(postCallArgs[0]).toBe('/assistant');

    // 2. Check that optionalAuth() was called and its result was passed as middleware
    expect(mockOptionalAuth).toHaveBeenCalledOnce();
    expect(postCallArgs[1]).toBe('optionalAuthMiddleware');

    // 3. Check the rest of the middlewares and the final controller in order
    expect(postCallArgs[2]).toBe(mockExtractTenantContext);
    expect(postCallArgs[3]).toBe(mockCheckDailyRequestLimit);
    expect(postCallArgs[4]).toBe(mockWritingController);

    // 4. Verify the total number of handlers
    expect(postCallArgs.length).toBe(5);
  });
});