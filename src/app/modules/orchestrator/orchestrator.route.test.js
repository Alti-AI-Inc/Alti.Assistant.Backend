import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the dependencies
// Mock orchestratorController
const mockRoutePrompt = vi.fn((req, res) => res.status(200).send('Prompt routed'));
vi.mock('./orchestrator.controller.js', () => ({
  orchestratorController: {
    routePrompt: mockRoutePrompt,
  },
}));

// Mock auth middleware
const mockAuthMiddleware = vi.fn((req, res, next) => {
  req.user = { id: 'test-user', role: 'user' }; // Simulate user being set by auth
  next();
});
const mockAuth = vi.fn(() => mockAuthMiddleware); // auth() returns a middleware function
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

// Mock shieldOfLight middleware
const mockShieldOfLightMiddleware = vi.fn((req, res, next) => {
  next();
});
const mockShieldOfLight = vi.fn(() => mockShieldOfLightMiddleware); // shieldOfLight() returns a middleware function
vi.mock('../../middlewares/shieldOfLight.js', () => ({
  shieldOfLight: mockShieldOfLight,
}));

// Mock createRateLimiter middleware
const mockRateLimiterActualMiddleware = vi.fn((req, res, next) => {
  next();
});
const mockCreateRateLimiter = vi.fn((limit, window) => {
  return mockRateLimiterActualMiddleware; // createRateLimiter() returns a middleware function
});
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: mockCreateRateLimiter,
}));

// Import the router AFTER mocks are set up
import { orchestratorRoutes } from './orchestrator.route.js';

describe('orchestratorRoutes', () => {
  let app;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create a new express app for each test to ensure isolation
    app = express();
    app.use(express.json()); // Needed if the controller expects JSON body
    app.use('/orchestrator', orchestratorRoutes); // Mount the router
  });

  it('should define a POST /route-prompt endpoint and apply all middleware in order', async () => {
    const response = await request(app)
      .post('/orchestrator/route-prompt')
      .send({ prompt: 'test prompt' });

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe('Prompt routed');

    // Verify that the middleware factory functions were called
    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockShieldOfLight).toHaveBeenCalledTimes(1);
    expect(mockCreateRateLimiter).toHaveBeenCalledTimes(1);
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(20, 15); // Verify rate limiter config

    // Verify that the actual middleware functions returned by the factories were called
    expect(mockAuthMiddleware).toHaveBeenCalledTimes(1);
    expect(mockShieldOfLightMiddleware).toHaveBeenCalledTimes(1);
    expect(mockRateLimiterActualMiddleware).toHaveBeenCalledTimes(1);

    // Verify that the controller was called
    expect(mockRoutePrompt).toHaveBeenCalledTimes(1);

    // Verify the call order of the actual middleware and the controller
    expect(mockAuthMiddleware).toHaveBeenCalledBefore(mockShieldOfLightMiddleware);
    expect(mockShieldOfLightMiddleware).toHaveBeenCalledBefore(mockRateLimiterActualMiddleware);
    expect(mockRateLimiterActualMiddleware).toHaveBeenCalledBefore(mockRoutePrompt);
  });

  it('should handle errors if a middleware stops the request (example)', async () => {
    // Temporarily modify a mock to simulate a middleware blocking the request
    mockAuthMiddleware.mockImplementationOnce((req, res, next) => {
      res.status(401).send('Unauthorized');
    });

    const response = await request(app)
      .post('/orchestrator/route-prompt')
      .send({ prompt: 'test prompt' });

    expect(response.statusCode).toBe(401);
    expect(response.text).toBe('Unauthorized');

    // Verify that subsequent middleware and the controller were NOT called
    expect(mockAuthMiddleware).toHaveBeenCalledTimes(1); // It was called
    expect(mockShieldOfLightMiddleware).not.toHaveBeenCalled();
    expect(mockRateLimiterActualMiddleware).not.toHaveBeenCalled();
    expect(mockRoutePrompt).not.toHaveBeenCalled();
  });
});