import { vi, describe, it, expect, beforeEach } from 'vitest';
import express from 'express';

const {
  mockRouter,
  mockAuth,
  mockOptionalAuth,
  mockCheckDailyRequestLimit,
  mockCreateRateLimiter,
  mockValidateRequest,
  mockExtractTenantContext,
  mockConversationalAssistant,
  mockGetConversationHistory,
  mockConversationalRequestSchema,
  mockGetConversationHistorySchema
} = vi.hoisted(() => {
  // Mock express.Router to capture calls
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
  };

  // Mock all middleware functions
  const mockAuth = vi.fn().mockImplementation(() => vi.fn()); // auth returns a middleware function
  const mockOptionalAuth = vi.fn().mockImplementation(() => vi.fn()); // optionalAuth returns a middleware function
  const mockCheckDailyRequestLimit = vi.fn(); // Direct middleware function
  const mockCreateRateLimiter = vi.fn().mockImplementation((limit, window) => vi.fn()); // createRateLimiter is a factory
  const mockValidateRequest = vi.fn().mockImplementation((schema) => vi.fn()); // validateRequest is a factory
  const mockExtractTenantContext = vi.fn(); // Direct middleware function

  // Mock controller functions
  const mockConversationalAssistant = vi.fn();
  const mockGetConversationHistory = vi.fn();

  // Mock validation schemas
  const mockConversationalRequestSchema = { _isJoi: true, description: 'conversationalRequestSchema' };
  const mockGetConversationHistorySchema = { _isJoi: true, description: 'getConversationHistorySchema' };

  return {
    mockRouter,
    mockAuth,
    mockOptionalAuth,
    mockCheckDailyRequestLimit,
    mockCreateRateLimiter,
    mockValidateRequest,
    mockExtractTenantContext,
    mockConversationalAssistant,
    mockGetConversationHistory,
    mockConversationalRequestSchema,
    mockGetConversationHistorySchema
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: mockCreateRateLimiter }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));

vi.mock('./creative_writing.controller.js', () => ({
  creativeWritingController: {
    conversationalAssistant: mockConversationalAssistant,
    getConversationHistory: mockGetConversationHistory,
  },
}));

vi.mock('./creative_writing.validation.js', () => ({
  CreativeWritingValidation: {
    conversationalRequestSchema: mockConversationalRequestSchema,
    getConversationHistorySchema: mockGetConversationHistorySchema,
  },
}));

// Import ENUM_USER_ROLE directly as it's a simple enum and doesn't need complex mocking
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// Import the file under test AFTER all mocks are set up
import { creativeWritingRoutes } from './creative_writing.route.js';

describe('creativeWritingRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-mock express.Router to ensure mockRouter.post/get are fresh vi.fn() instances
    // This is important because `vi.clearAllMocks()` only clears call history, not the mock implementation itself
    // if the mock was defined globally.
    express.Router.mockClear();
    express.Router.mockReturnValue(mockRouter);
  });

  it('should export the router instance', () => {
    expect(creativeWritingRoutes).toBe(mockRouter);
  });

  describe('POST /assistant', () => {
    it('should define the POST /assistant route with the correct middleware chain and controller', () => {
      // Ensure router.post was called
      expect(mockRouter.post).toHaveBeenCalledTimes(1);

      // Get the arguments passed to router.post
      const postArgs = mockRouter.post.mock.calls[0];

      // Verify the path
      expect(postArgs[0]).toBe('/assistant');

      // Verify the middleware functions and their order
      expect(postArgs[1]).toBeInstanceOf(Function); // optionalAuth()
      expect(postArgs[2]).toBe(mockExtractTenantContext);
      expect(postArgs[3]).toBe(mockCheckDailyRequestLimit);
      expect(postArgs[4]).toBeInstanceOf(Function); // createRateLimiter(30, 15)
      expect(postArgs[5]).toBeInstanceOf(Function); // validateRequest(CreativeWritingValidation.conversationalRequestSchema)
      expect(postArgs[6]).toBe(mockConversationalAssistant); // Controller

      // Verify specific middleware factory calls and their arguments
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
      expect(mockOptionalAuth).toHaveBeenCalledWith();

      expect(mockCreateRateLimiter).toHaveBeenCalledTimes(1);
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(30, 15);

      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockConversationalRequestSchema);

      // Verify direct middleware calls (these are called once per route they are in)
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(1);
      expect(mockCheckDailyRequestLimit).toHaveBeenCalledTimes(1);

      // Verify the controller is the last argument
      expect(postArgs[postArgs.length - 1]).toBe(mockConversationalAssistant);
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should define the GET /conversation/:conversationId route with the correct middleware chain and controller', () => {
      // Ensure router.get was called
      expect(mockRouter.get).toHaveBeenCalledTimes(1);

      // Get the arguments passed to router.get
      const getArgs = mockRouter.get.mock.calls[0];

      // Verify the path
      expect(getArgs[0]).toBe('/conversation/:conversationId');

      // Verify the middleware functions and their order
      expect(getArgs[1]).toBeInstanceOf(Function); // auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN)
      expect(getArgs[2]).toBe(mockExtractTenantContext);
      expect(getArgs[3]).toBeInstanceOf(Function); // validateRequest(CreativeWritingValidation.getConversationHistorySchema)
      expect(getArgs[4]).toBe(mockGetConversationHistory); // Controller

      // Verify specific middleware factory calls and their arguments
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);

      // validateRequest was called once for POST and once for GET
      expect(mockValidateRequest).toHaveBeenCalledTimes(2);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockGetConversationHistorySchema);

      // extractTenantContext was called once for POST and once for GET
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(2);

      // Verify the controller is the last argument
      expect(getArgs[getArgs.length - 1]).toBe(mockGetConversationHistory);
    });
  });
});