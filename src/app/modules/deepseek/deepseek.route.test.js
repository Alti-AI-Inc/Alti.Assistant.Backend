import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock external dependencies

// Mock the actual middleware function that `auth` returns.
// This function will be passed to `router.post`.
const mockAuthMiddlewareFunction = vi.fn((req, res, next) => next());

// Mock the `auth` higher-order function itself.
// This function is called with roles and returns a middleware function.
const mockAuth = vi.fn((...roles) => {
  // When `auth` is called, it should return our specific mock middleware function.
  return mockAuthMiddlewareFunction;
});

// Mock the DeepseekAiController and its method.
const mockDeepseekAiController = {
  DeepseekAiGetResponse: vi.fn(),
};

// Mock the express router methods that are expected to be called.
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(), // Include if other methods are used
  use: vi.fn(), // Include if .use() is called
};

// Mock the 'express' module to return our mock router when `Router()` is called.
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock the shared enum module.
const ENUM_USER_ROLE = {
  ADMIN: 'admin',
  USER: 'user',
};
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: ENUM_USER_ROLE,
}));

// Mock the 'auth' middleware module.
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

// Mock the DeepseekAiController module.
vi.mock('./deepseek.controller.js', () => ({
  DeepseekAiController: mockDeepseekAiController,
}));

// Import the module under test *after* all mocks are set up.
// This ensures that when `deepseek.route.js` is evaluated, it uses our mocked dependencies.
import { deepseekAiRoutes } from './deepseek.route.js';

describe('deepseekAiRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure a clean state and prevent test pollution.
    mockRouter.post.mockClear();
    mockRouter.get.mockClear();
    mockRouter.use.mockClear();
    mockAuth.mockClear();
    mockAuthMiddlewareFunction.mockClear();
    mockDeepseekAiController.DeepseekAiGetResponse.mockClear();
  });

  it('should export an express router instance', () => {
    // Verify that the exported `deepseekAiRoutes` is indeed our mocked router instance.
    expect(deepseekAiRoutes).toBe(mockRouter);
  });

  it('should define a POST /get-response route', () => {
    // Verify that `router.post` was called exactly once.
    expect(mockRouter.post).toHaveBeenCalledTimes(1);

    // Verify the arguments passed to `router.post`:
    // 1. The correct path.
    // 2. The specific middleware function returned by `auth()`.
    // 3. The correct controller method.
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/get-response',
      mockAuthMiddlewareFunction, // The specific middleware instance returned by mockAuth
      mockDeepseekAiController.DeepseekAiGetResponse
    );
  });

  it('should apply the auth middleware with ADMIN and USER roles', () => {
    // Verify that the `auth` higher-order function was called exactly once.
    expect(mockAuth).toHaveBeenCalledTimes(1);

    // Verify that `auth` was called with the correct user roles.
    expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);

    // Optionally, re-verify that the function returned by `auth` was passed to `router.post`.
    // This is already covered by the previous test's `toHaveBeenCalledWith` assertion,
    // but can be explicitly checked for clarity if desired.
    const postCallArgs = mockRouter.post.mock.calls[0];
    expect(postCallArgs[1]).toBe(mockAuthMiddlewareFunction);
  });

  it('should use DeepseekAiController.DeepseekAiGetResponse as the route handler', () => {
    // Verify that the controller method was passed as the final handler to `router.post`.
    // This is also covered by the first test's `toHaveBeenCalledWith` assertion.
    const postCallArgs = mockRouter.post.mock.calls[0];
    expect(postCallArgs[2]).toBe(mockDeepseekAiController.DeepseekAiGetResponse);
  });
});