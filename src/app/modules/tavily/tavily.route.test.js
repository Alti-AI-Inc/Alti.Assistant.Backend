import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TavilyAiController } from './tavily.controller.js';

// Mock the express router
const mockPost = vi.fn();
const mockRoute = vi.fn(() => ({ post: mockPost }));
const mockRouter = {
  route: mockRoute,
};

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

// Mock the controller
vi.mock('./tavily.controller.js', () => ({
  TavilyAiController: {
    TavilyAiGetResponseAnonymously: vi.fn(),
  },
}));

describe('Tavily AI Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should define a POST route for /get-response-anonymously', async () => {
    // Dynamically import the router to execute its setup after mocks are in place
    await import('./tavily.route.js');

    expect(mockRouter.route).toHaveBeenCalledWith('/get-response-anonymously');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(expect.any(Function));
  });

  describe('POST /get-response-anonymously handler', () => {
    let handler;
    const req = { body: { query: 'test' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    beforeEach(async () => {
      // Re-import to get a fresh instance and capture the handler
      await import('./tavily.route.js');
      handler = mockPost.mock.calls[0][0];
    });

    it('should call TavilyAiController.TavilyAiGetResponseAnonymously on success', async () => {
      // Arrange
      TavilyAiController.TavilyAiGetResponseAnonymously.mockResolvedValue('Success');

      // Act
      await handler(req, res, next);

      // Assert
      expect(TavilyAiController.TavilyAiGetResponseAnonymously).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next with an error if the controller throws an error', async () => {
      // Arrange
      const testError = new Error('Controller Error');
      TavilyAiController.TavilyAiGetResponseAnonymously.mockRejectedValue(testError);

      // Act
      await handler(req, res, next);

      // Assert
      expect(TavilyAiController.TavilyAiGetResponseAnonymously).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(testError);
    });

    it('should not have any role-based access control middleware', async () => {
      // This test confirms the absence of authentication/authorization middleware,
      // as this is an anonymous endpoint. The mockPost should be called with exactly
      // one argument: the async handler.
      expect(mockPost.mock.calls[0].length).toBe(1);
    });
  });
});