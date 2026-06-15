import { describe, it, expect, vi } from 'vitest';
import express from 'express';

const {
  mockRouter,
  ENUM_USER_ROLE,
  mockAuth,
  mockOptionalAuth,
  mockCreateRateLimiter,
  mockValidateRequest,
  mockExtractTenantContext,
  mockCheckDailyRequestLimit,
  mockVideoController,
  mockVideoValidation
} = vi.hoisted(() => {
  // Create a single mock router instance that will be returned by express.Router()
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    use: vi.fn(),
  };

  // Mock shared enum
  const ENUM_USER_ROLE = {
    ADMIN: 'admin',
    USER: 'user',
  };

  // Mock middlewares that return functions
  const mockAuth = vi.fn().mockImplementation(() => vi.fn().mockImplementation((req, res, next) => next()));

  const mockOptionalAuth = vi.fn().mockImplementation(() => vi.fn().mockImplementation((req, res, next) => next()));

  const mockCreateRateLimiter = vi.fn().mockImplementation((limit, window) => vi.fn().mockImplementation((req, res, next) => next()));

  const mockValidateRequest = vi.fn().mockImplementation((schema) => vi.fn().mockImplementation((req, res, next) => next()));

  // Mock direct middleware functions
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());

  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());

  // Mock controller
  const mockVideoController = {
    generateVideo: vi.fn(),
    getOperationStatus: vi.fn(),
    getVideoStats: vi.fn(),
    getVideoConversation: vi.fn(),
    getGuestConversations: vi.fn(),
  };

  // Mock validation schemas
  const mockVideoValidation = {
    videoGenerationSchema: { type: 'object', properties: { prompt: { type: 'string' } } },
    conversationSchema: { type: 'object', properties: { conversationId: { type: 'string' } } },
    guestUserSchema: { type: 'object', properties: { guestUserId: { type: 'string' } } },
  };

  return {
    mockRouter,
    ENUM_USER_ROLE,
    mockAuth,
    mockOptionalAuth,
    mockCreateRateLimiter,
    mockValidateRequest,
    mockExtractTenantContext,
    mockCheckDailyRequestLimit,
    mockVideoController,
    mockVideoValidation
  };
});

// Mock express to return our mock router instance
vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter), // Always return the same mockRouter instance
  },
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE,
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: mockOptionalAuth,
}));

vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: mockCreateRateLimiter,
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: mockValidateRequest,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

vi.mock('./video.controller.js', () => ({
  videoController: mockVideoController,
}));

vi.mock('./video.validation.js', () => ({
  VideoValidation: mockVideoValidation,
}));

// Import the module under test AFTER all mocks are set up.
// This will trigger the execution of the router definitions.
const { videoRoutes } = await import('./video.route.js');

describe('Video Routes', () => {
  // No beforeEach to clear mocks, as the module is loaded once and all routes are defined then.
  // We are testing the static definition of routes as they are configured during module load.

  it('should export an express router', () => {
    expect(videoRoutes).toBeDefined();
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(videoRoutes).toBe(mockRouter); // Ensure the exported router is our mock instance
  });

  // Test POST /generate route
  it('should define the POST /generate route with correct middlewares and controller', () => {
    const generateRouteCalls = mockRouter.post.mock.calls.find(call => call[0] === '/generate');
    expect(generateRouteCalls).toBeDefined();
    expect(generateRouteCalls[0]).toBe('/generate');

    const middlewares = generateRouteCalls.slice(1, -1); // All args except path and last (controller)
    const controller = generateRouteCalls[generateRouteCalls.length - 1];

    expect(middlewares).toHaveLength(5); // optionalAuth(), extractTenantContext, checkDailyRequestLimit, createRateLimiter, validateRequest

    expect(mockOptionalAuth).toHaveBeenCalledWith(); // Ensure optionalAuth() was called
    expect(middlewares[0]).toBe(mockOptionalAuth.mock.results[0].value); // Check if it's the *returned* middleware function

    expect(middlewares[1]).toBe(mockExtractTenantContext);
    expect(middlewares[2]).toBe(mockCheckDailyRequestLimit);

    expect(mockCreateRateLimiter).toHaveBeenCalledWith(10, 15); // Ensure createRateLimiter() was called with correct args
    expect(middlewares[3]).toBe(mockCreateRateLimiter.mock.results[0].value); // Check if it's the *returned* middleware function

    expect(mockValidateRequest).toHaveBeenCalledWith(mockVideoValidation.videoGenerationSchema); // Ensure validateRequest() was called with correct schema
    expect(middlewares[4]).toBe(mockValidateRequest.mock.results[0].value); // Check if it's the *returned* middleware function

    expect(controller).toBe(mockVideoController.generateVideo); // Check if the correct controller method is used
  });

  // Test POST /operations route
  it('should define the POST /operations route with correct middlewares and controller', () => {
    const operationsRouteCalls = mockRouter.post.mock.calls.find(call => call[0] === '/operations');
    expect(operationsRouteCalls).toBeDefined();
    expect(operationsRouteCalls[0]).toBe('/operations');

    const middlewares = operationsRouteCalls.slice(1, -1);
    const controller = operationsRouteCalls[operationsRouteCalls.length - 1];

    expect(middlewares).toHaveLength(3); // optionalAuth(), extractTenantContext, createRateLimiter

    expect(mockOptionalAuth).toHaveBeenCalledWith();
    expect(middlewares[0]).toBe(mockOptionalAuth.mock.results[1].value); // Second call result for optionalAuth()

    expect(middlewares[1]).toBe(mockExtractTenantContext);

    expect(mockCreateRateLimiter).toHaveBeenCalledWith(20, 1);
    expect(middlewares[2]).toBe(mockCreateRateLimiter.mock.results[1].value); // Second call result for createRateLimiter()

    expect(controller).toBe(mockVideoController.getOperationStatus);
  });

  // Test GET /stats route
  it('should define the GET /stats route with correct middlewares and controller', () => {
    const statsRouteCalls = mockRouter.get.mock.calls.find(call => call[0] === '/stats');
    expect(statsRouteCalls).toBeDefined();
    expect(statsRouteCalls[0]).toBe('/stats');

    const middlewares = statsRouteCalls.slice(1, -1);
    const controller = statsRouteCalls[statsRouteCalls.length - 1];

    expect(middlewares).toHaveLength(2); // auth(), extractTenantContext

    expect(mockAuth).toHaveBeenCalledWith(
      ENUM_USER_ROLE.ADMIN,
      ENUM_USER_ROLE.USER
    ); // Ensure auth() was called with correct roles
    expect(middlewares[0]).toBe(mockAuth.mock.results[0].value); // First call result for auth()

    expect(middlewares[1]).toBe(mockExtractTenantContext);

    expect(controller).toBe(mockVideoController.getVideoStats);
  });

  // Test GET /conversation/:conversationId route
  it('should define the GET /conversation/:conversationId route with correct middlewares and controller', () => {
    const conversationRouteCalls = mockRouter.get.mock.calls.find(call => call[0] === '/conversation/:conversationId');
    expect(conversationRouteCalls).toBeDefined();
    expect(conversationRouteCalls[0]).toBe('/conversation/:conversationId');

    const middlewares = conversationRouteCalls.slice(1, -1);
    const controller = conversationRouteCalls[conversationRouteCalls.length - 1];

    expect(middlewares).toHaveLength(4); // optionalAuth(), extractTenantContext, createRateLimiter, validateRequest

    expect(mockOptionalAuth).toHaveBeenCalledWith();
    expect(middlewares[0]).toBe(mockOptionalAuth.mock.results[2].value); // Third call result for optionalAuth()

    expect(middlewares[1]).toBe(mockExtractTenantContext);

    expect(mockCreateRateLimiter).toHaveBeenCalledWith(10, 1);
    expect(middlewares[2]).toBe(mockCreateRateLimiter.mock.results[2].value); // Third call result for createRateLimiter()

    expect(mockValidateRequest).toHaveBeenCalledWith(mockVideoValidation.conversationSchema);
    expect(middlewares[3]).toBe(mockValidateRequest.mock.results[1].value); // Second call result for validateRequest()

    expect(controller).toBe(mockVideoController.getVideoConversation);
  });

  // Test GET /guest/:guestUserId/conversations route
  it('should define the GET /guest/:guestUserId/conversations route with correct middlewares and controller', () => {
    const guestConversationsRouteCalls = mockRouter.get.mock.calls.find(call => call[0] === '/guest/:guestUserId/conversations');
    expect(guestConversationsRouteCalls).toBeDefined();
    expect(guestConversationsRouteCalls[0]).toBe('/guest/:guestUserId/conversations');

    const middlewares = guestConversationsRouteCalls.slice(1, -1);
    const controller = guestConversationsRouteCalls[guestConversationsRouteCalls.length - 1];

    expect(middlewares).toHaveLength(4); // optionalAuth(), extractTenantContext, createRateLimiter, validateRequest

    expect(mockOptionalAuth).toHaveBeenCalledWith();
    expect(middlewares[0]).toBe(mockOptionalAuth.mock.results[3].value); // Fourth call result for optionalAuth()

    expect(middlewares[1]).toBe(mockExtractTenantContext);

    expect(mockCreateRateLimiter).toHaveBeenCalledWith(10, 1);
    expect(middlewares[2]).toBe(mockCreateRateLimiter.mock.results[3].value); // Fourth call result for createRateLimiter()

    expect(mockValidateRequest).toHaveBeenCalledWith(mockVideoValidation.guestUserSchema);
    expect(middlewares[3]).toBe(mockValidateRequest.mock.results[2].value); // Third call result for validateRequest()

    expect(controller).toBe(mockVideoController.getGuestConversations);
  });
});