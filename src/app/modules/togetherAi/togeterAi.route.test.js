import { describe, test, expect, vi, beforeEach } from 'vitest';
import express from 'express'; // This import is needed for type inference if not mocked globally, but we will mock it.

// Mock the express module
const mockPost = vi.fn();
const mockRoute = vi.fn(() => ({
  post: mockPost,
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  all: vi.fn(),
}));
const mockRouterInstance = {
  route: mockRoute,
  use: vi.fn(),
  // Add other router methods if they were used in the file under test
};
const mockRouter = vi.fn(() => mockRouterInstance);

vi.mock('express', () => ({
  default: {
    Router: mockRouter,
  },
}));

// Mock the TogetherAiController
const mockTogetherAiImgGeneration = vi.fn();

vi.mock('./togeterAi.controller.js', () => ({
  TogetherAiController: {
    TogetherAiImgGeneration: mockTogetherAiImgGeneration,
  },
}));

// Import the module under test AFTER all mocks are set up
// This ensures that when the module executes, it uses our mocked dependencies.
import { togetherAiRoutes } from './togeterAi.route.js';

describe('togetherAiRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-import the module to re-run its setup logic with fresh mocks
    // This is crucial for modules that define routes at the top level
    // and don't export a function to configure them.
    // For this specific case, the import happens once at the top,
    // so we just need to ensure the mocks are clean.
  });

  test('should initialize an express router', () => {
    // The router is initialized when the module is imported
    expect(mockRouter).toHaveBeenCalledTimes(1);
  });

  test('should define the POST /create-img route with TogetherAiController.TogetherAiImgGeneration handler', () => {
    // Verify that router.route('/create-img') was called
    expect(mockRoute).toHaveBeenCalledTimes(1);
    expect(mockRoute).toHaveBeenCalledWith('/create-img');

    // Verify that .post() was called on the route builder
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Verify that the correct controller method was passed to .post()
    expect(mockPost).toHaveBeenCalledWith(mockTogetherAiImgGeneration);
  });

  test('should export the configured router instance', () => {
    // Verify that the exported `togetherAiRoutes` is the mock router instance
    // returned by our `mockRouter` function.
    expect(togetherAiRoutes).toBe(mockRouterInstance);
  });
});