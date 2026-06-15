import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRouter,
  mockCyberdeskController
} = vi.hoisted(() => {
  // Mock express and its Router method
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  };

  // Mock the cyberdeskController
  const mockCyberdeskController = {
    launch: vi.fn(),
    info: vi.fn(),
    click: vi.fn(),
    bash: vi.fn(),
    terminate: vi.fn(),
  };

  return {
    mockRouter,
    mockCyberdeskController
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('./cyberdesk.controller.js', () => ({
  cyberdeskController: mockCyberdeskController,
}));

// Import the router AFTER mocks are set up
// This ensures that when cyberdesk.route.js is imported,
// it uses our mocked express and controller.
import { cyberdeskRoutes } from './cyberdesk.route.js';
import express from 'express'; // Import express to assert Router was called

describe('cyberdeskRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-import the module to re-run the route definitions
    // This is important if the module's side effects (route definitions)
    // are what we're testing, and we want a fresh state for each test.
    // However, for a simple route definition file, the routes are defined once
    // when the module is first imported. Clearing mocks is usually sufficient.
    // If we were testing dynamic route creation, a re-import might be needed.
    // For this static route file, the initial import is enough.
  });

  it('should create an Express router instance', () => {
    // The import of cyberdeskRoutes already triggers the router creation.
    // We just need to assert that express.Router was called.
    expect(express.Router).toHaveBeenCalledTimes(1);
  });

  it('should define the POST /launch route with the correct controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/launch', mockCyberdeskController.launch);
  });

  it('should define the GET /info/:id route with the correct controller', () => {
    expect(mockRouter.get).toHaveBeenCalledWith('/info/:id', mockCyberdeskController.info);
  });

  it('should define the POST /click/:id route with the correct controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/click/:id', mockCyberdeskController.click);
  });

  it('should define the POST /bash/:id route with the correct controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/bash/:id', mockCyberdeskController.bash);
  });

  it('should define the DELETE /terminate/:id route with the correct controller', () => {
    expect(mockRouter.delete).toHaveBeenCalledWith('/terminate/:id', mockCyberdeskController.terminate);
  });

  it('should export the created router instance', () => {
    // In our test setup, `express.Router()` returns `mockRouter`.
    // Therefore, `cyberdeskRoutes` should be strictly equal to `mockRouter`.
    expect(cyberdeskRoutes).toBe(mockRouter);
  });

  it('should have defined exactly 5 routes', () => {
    // Check that no extra routes were defined and all expected methods were called once.
    expect(mockRouter.post).toHaveBeenCalledTimes(3); // /launch, /click/:id, /bash/:id
    expect(mockRouter.get).toHaveBeenCalledTimes(1);  // /info/:id
    expect(mockRouter.delete).toHaveBeenCalledTimes(1); // /terminate/:id
  });
});