import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleSearchController } from './google-search.controller.js';

// Mock the express router to intercept route definitions
const mockPost = vi.fn();
const mockRoute = vi.fn().mockImplementation(() => ({
  post: mockPost,
}));
const {
  mockRouter
} = vi.hoisted(() => {
  const mockRouter = {
    route: mockRoute,
  };

  return {
    mockRouter
  };
});

// Mock dependencies BEFORE they are imported by the module under test
vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('./google-search.controller.js', () => ({
  GoogleSearchController: {
    GoogleSearchGetResponse: vi.fn(),
  },
}));

describe('Google Search Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test to ensure a clean state
    vi.clearAllMocks();
  });

  it('should define a public POST route for /get-response-anonymously without auth middleware', async () => {
    // Dynamically import the router file. This executes the top-level code
    // which defines the routes on our mocked router.
    await import('./google-search.route.js');

    // 1. Verify the route path is correctly configured
    expect(mockRouter.route).toHaveBeenCalledWith('/get-response-anonymously');
    expect(mockRouter.route).toHaveBeenCalledTimes(1);

    // 2. Verify it's configured to handle a POST request
    expect(mockPost).toHaveBeenCalledTimes(1);

    // 3. Verify the absence of role-based access middleware.
    // A route with middleware would look like .post(authMiddleware, controller), resulting in 2+ arguments.
    // We expect exactly one argument: the final handler function.
    const postCallArgs = mockPost.mock.calls[0];
    expect(postCallArgs).toHaveLength(1);
    expect(postCallArgs[0]).toBeTypeOf('function');
  });

  it('should wrap the controller method with an asyncHandler that catches and forwards errors', async () => {
    await import('./google-search.route.js');

    // Retrieve the actual handler function that was passed to .post()
    const asyncHandlerWrapper = mockPost.mock.calls[0][0];

    // Prepare mock request, response, and next function for the test
    const req = { body: { query: 'test' } };
    const res = {}; // Not used in the error path
    const next = vi.fn();

    // Simulate the controller method throwing an error (or rejecting a promise)
    const simulatedError = new Error('Controller failed to process request');
    GoogleSearchController.GoogleSearchGetResponse.mockRejectedValue(simulatedError);

    // Execute the wrapped handler
    await asyncHandlerWrapper(req, res, next);

    // Verify that the underlying controller method was called
    expect(GoogleSearchController.GoogleSearchGetResponse).toHaveBeenCalledWith(req, res, next);

    // Verify that the asyncHandler caught the error and passed it to Express's error handler
    expect(next).toHaveBeenCalledWith(simulatedError);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call the correct controller method when the wrapped handler is executed successfully', async () => {
    await import('./google-search.route.js');

    // Retrieve the handler
    const asyncHandlerWrapper = mockPost.mock.calls[0][0];

    // Prepare mock objects for a successful request
    const req = { body: { query: 'test' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    // Mock the controller to simulate a successful execution (resolving a promise)
    const successResponse = { data: 'some search results' };
    GoogleSearchController.GoogleSearchGetResponse.mockResolvedValue(successResponse);

    // Execute the handler
    await asyncHandlerWrapper(req, res, next);

    // Verify the correct controller was called with the right arguments
    expect(GoogleSearchController.GoogleSearchGetResponse).toHaveBeenCalledWith(req, res, next);

    // On success, `next` should NOT be called with an error
    expect(next).not.toHaveBeenCalled();
  });
});