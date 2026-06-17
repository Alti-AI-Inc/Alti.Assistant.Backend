import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockAuthStreamingController,
  mockExpressRouter
} = vi.hoisted(() => {
  // Mock the controller dependency. This replaces the actual controller with a mock.
  const mockAuthStreamingController = vi.fn();
  const mockExpressRouter = vi.fn().mockImplementation(() => mockRouter);

  return {
    mockAuthStreamingController,
    mockExpressRouter
  };
});

vi.mock('./streaming.controller.js', () => ({
  authStreamingController: mockAuthStreamingController,
}));

// Mock the express router. This allows us to spy on its methods like .route() and .get().
const mockGet = vi.fn();
const mockRoute = vi.fn().mockImplementation(() => ({ get: mockGet }));
const mockRouter = {
  route: mockRoute,
};
vi.mock('express', () => ({
  default: { Router: mockExpressRouter },
  Router: mockExpressRouter,
}));

describe('Streaming Routes', () => {
  beforeEach(async () => {
    // Reset modules and mocks before each test to ensure a clean state and prevent test pollution.
    vi.resetModules();
    vi.clearAllMocks();

    // Dynamically import the router file. This executes the file's code,
    // which calls express.Router() and sets up the routes using our mocks.
    await import('./streaming.route.js');
  });

  it('should create a new Express router instance', () => {
    // Verify that the router setup process was initiated.
    expect(mockExpressRouter).toHaveBeenCalledOnce();
  });

  describe('GET /get-token', () => {
    it('should define the /get-token route', () => {
      // Verify that the .route() method was called with the correct path.
      expect(mockRouter.route).toHaveBeenCalledWith('/get-token');
      expect(mockRouter.route).toHaveBeenCalledOnce();
    });

    it('should handle GET requests with the authStreamingController', () => {
      // Verify that the GET method for the route is wired to the correct controller function.
      expect(mockGet).toHaveBeenCalledWith(mockAuthStreamingController);
      expect(mockGet).toHaveBeenCalledOnce();
    });

    it('should be a public route with no role-based access control middleware', () => {
      // This test addresses the requirement to check for role-based access.
      // We verify its absence by checking that no middleware functions were passed
      // to the .get() method before the final controller. The call should only
      // have one argument: the controller itself.
      const getCallArguments = mockGet.mock.calls[0];
      expect(getCallArguments.length).toBe(1);
    });
  });
});