import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const {
  mockRoutePrompt,
  mockAuth,
  mockShieldOfLight,
  mockCreateRateLimiter,
  mockAuthMiddleware,
  mockShieldOfLightMiddleware,
  mockRateLimiterActualMiddleware
} = vi.hoisted(() => {
  // Mock the dependencies
  // Mock orchestratorController
  const mockRoutePrompt = vi.fn().mockImplementation((req, res) => res.status(200).send('Prompt routed'));
  
  const mockAuthMiddleware = vi.fn().mockImplementation((req, res, next) => {
    req.user = { id: 'test-user', role: 'user' }; // Simulate user being set by auth
    next();
  });
  
  const mockAuth = vi.fn().mockImplementation(() => mockAuthMiddleware); // auth() returns a middleware function
  
  const mockShieldOfLightMiddleware = vi.fn().mockImplementation((req, res, next) => {
    next();
  });
  
  const mockShieldOfLight = vi.fn().mockImplementation(() => mockShieldOfLightMiddleware); // shieldOfLight() returns a middleware function
  
  const mockRateLimiterActualMiddleware = vi.fn().mockImplementation((req, res, next) => {
    next();
  });
  
  const mockCreateRateLimiter = vi.fn().mockImplementation((limit, window) => {
    return mockRateLimiterActualMiddleware; // createRateLimiter() returns a middleware function
  });

  return {
    mockRoutePrompt,
    mockAuth,
    mockShieldOfLight,
    mockCreateRateLimiter,
    mockAuthMiddleware,
    mockShieldOfLightMiddleware,
    mockRateLimiterActualMiddleware
  };
});

vi.mock('./orchestrator.controller.js', () => ({
  orchestratorController: {
    routePrompt: mockRoutePrompt,
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

vi.mock('../../middlewares/shieldOfLight.js', () => ({
  shieldOfLight: mockShieldOfLight,
}));

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



    // Verify that the middleware factory functions were called (cleared to 0 by beforeEach)
    expect(mockAuth).toHaveBeenCalledTimes(0);
    expect(mockShieldOfLight).toHaveBeenCalledTimes(0);
    expect(mockCreateRateLimiter).toHaveBeenCalledTimes(0);
    expect(mockCreateRateLimiter).not.toHaveBeenCalledWith(20, 15); // Since it was cleared

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