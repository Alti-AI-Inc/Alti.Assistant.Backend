import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { serperAiRoutes } from './serper.route.js';
import { SerperAiController } from './serper.controller.js';

// Define mock functions for the router's methods
const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();
const mockUse = vi.fn();

// This object represents what `router.route('/path')` would return
const mockRouteObject = {
  post: mockPost,
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
};

// This function represents the `router.route` method
const mockRouteMethod = vi.fn((path) => mockRouteObject);

// This object represents the router instance returned by `express.Router()`
const mockRouterInstance = {
  route: mockRouteMethod,
  use: mockUse,
  // Add direct methods if the router can also have them (e.g., router.post('/path', handler))
  // Although not used in this specific route file, it's good to have a comprehensive mock
  post: mockPost,
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
};

// Mock express and its Router method to return our mock router instance
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouterInstance),
  },
}));

// Mock the SerperAiController to ensure it's imported but its methods are not actually executed
vi.mock('./serper.controller.js', () => ({
  SerperAiController: {
    SerperAiGetResponse: vi.fn(), // Mock the specific method used in the route
  },
}));

describe('serperAiRoutes', () => {
  // The module under test (serper.route.js) is imported at the top level,
  // so its execution (calling express.Router() and defining routes) happens once
  // when the test file is loaded. We will check the state of the mocks after this.

  beforeEach(() => {
    // Clear all mock calls before each test to ensure isolation
    vi.clearAllMocks();
  });

  it('should create an express router instance', () => {
    // Verify that express.Router() was called exactly once when the module loaded
    expect(express.default.Router).toHaveBeenCalledTimes(1);
  });

  it('should define a POST /get-response route', () => {
    // Verify that router.route('/get-response') was called
    expect(mockRouteMethod).toHaveBeenCalledTimes(1);
    expect(mockRouteMethod).toHaveBeenCalledWith('/get-response');

    // Verify that the .post() method was called on the object returned by .route()
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Verify that .post() was called with the correct controller method
    expect(mockPost).toHaveBeenCalledWith(SerperAiController.SerperAiGetResponse);
  });

  it('should export the created router instance', () => {
    // Verify that the exported serperAiRoutes is the same mock router instance
    // that was returned by express.Router()
    expect(serperAiRoutes).toBe(mockRouterInstance);
  });
});