import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock all external dependencies
const mockOptionalAuth = vi.fn(() => vi.fn((req, res, next) => next()));
const mockAuth = vi.fn(() => vi.fn((req, res, next) => next()));
const mockCheckDailyRequestLimit = vi.fn((req, res, next) => next());
const mockCreateRateLimiter = vi.fn((limit, window) => vi.fn((req, res, next) => next()));
const mockValidateRequest = vi.fn(() => vi.fn((req, res, next) => next()));
const mockExtractTenantContext = vi.fn((req, res, next) => next());

const mockBrainstormController = {
  conversationalAssistant: vi.fn(),
  generateBrainstorm: vi.fn(),
  getConversationHistory: vi.fn(),
  exportBrainstorm: vi.fn(),
  refineBrainstorm: vi.fn(),
};

const mockBrainstormValidation = {
  conversationalBrainstormSchema: {},
  structuredBrainstormSchema: {},
  getConversationHistorySchema: {},
  exportBrainstormSchema: {},
  refineBrainstormSchema: {},
};

const ENUM_USER_ROLE = {
  USER: 'user',
  ADMIN: 'admin',
};

// Mock express.Router
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
};

vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: ENUM_USER_ROLE,
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: mockOptionalAuth,
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: mockCreateRateLimiter,
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: mockValidateRequest,
}));

vi.mock('./brainstorm.controller.js', () => ({
  brainstormController: mockBrainstormController,
}));

vi.mock('./brainstorm.validation.js', () => ({
  BrainstormValidation: mockBrainstormValidation,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

// Import the module after all mocks are set up
import { brainstormRoutes } from './brainstorm.route.js';

describe('brainstormRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Re-mock the return values for functions that return middleware
    mockOptionalAuth.mockReturnValue(vi.fn((req, res, next) => next()));
    mockAuth.mockReturnValue(vi.fn((req, res, next) => next()));
    mockCreateRateLimiter.mockImplementation((limit, window) => vi.fn((req, res, next) => next()));
    mockValidateRequest.mockImplementation(() => vi.fn((req, res, next) => next()));
  });

  it('should export the router', () => {
    expect(brainstormRoutes).toBe(mockRouter);
  });

  describe('POST /assistant', () => {
    it('should define the POST /assistant route with correct middlewares and controller', () => {
      // Ensure express.Router() was called
      expect(express.Router).toHaveBeenCalledOnce();

      // Verify the route definition
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/assistant',
        expect.any(Function), // optionalAuth() returns a middleware
        mockExtractTenantContext,
        mockCheckDailyRequestLimit,
        expect.any(Function), // createRateLimiter() returns a middleware
        expect.any(Function), // validateRequest() returns a middleware
        mockBrainstormController.conversationalAssistant
      );

      // Verify specific middleware calls
      expect(mockOptionalAuth).toHaveBeenCalledOnce();
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(30, 15);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockBrainstormValidation.conversationalBrainstormSchema);

      // Verify the order of middlewares passed to router.post
      const calls = mockRouter.post.mock.calls[0];
      expect(calls[1]).toBe(mockOptionalAuth()); // The actual middleware returned by optionalAuth()
      expect(calls[2]).toBe(mockExtractTenantContext);
      expect(calls[3]).toBe(mockCheckDailyRequestLimit);
      expect(calls[4]).toBe(mockCreateRateLimiter(30, 15)); // The actual middleware returned by createRateLimiter
      expect(calls[5]).toBe(mockValidateRequest(mockBrainstormValidation.conversationalBrainstormSchema)); // The actual middleware returned by validateRequest
      expect(calls[6]).toBe(mockBrainstormController.conversationalAssistant);
    });
  });

  describe('POST /generate', () => {
    it('should define the POST /generate route with correct middlewares and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/generate',
        expect.any(Function), // optionalAuth()
        mockExtractTenantContext,
        expect.any(Function), // createRateLimiter()
        expect.any(Function), // validateRequest()
        mockBrainstormController.generateBrainstorm
      );

      expect(mockOptionalAuth).toHaveBeenCalledOnce(); // Already called for /assistant, so this is the second call
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(20, 15);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockBrainstormValidation.structuredBrainstormSchema);

      // Verify the order of middlewares passed to router.post
      const calls = mockRouter.post.mock.calls.find(call => call[0] === '/generate');
      expect(calls[1]).toBe(mockOptionalAuth());
      expect(calls[2]).toBe(mockExtractTenantContext);
      expect(calls[3]).toBe(mockCreateRateLimiter(20, 15));
      expect(calls[4]).toBe(mockValidateRequest(mockBrainstormValidation.structuredBrainstormSchema));
      expect(calls[5]).toBe(mockBrainstormController.generateBrainstorm);
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should define the GET /conversation/:conversationId route with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/conversation/:conversationId',
        expect.any(Function), // auth()
        mockExtractTenantContext,
        expect.any(Function), // validateRequest()
        mockBrainstormController.getConversationHistory
      );

      expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockBrainstormValidation.getConversationHistorySchema);

      // Verify the order of middlewares passed to router.get
      const calls = mockRouter.get.mock.calls.find(call => call[0] === '/conversation/:conversationId');
      expect(calls[1]).toBe(mockAuth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN));
      expect(calls[2]).toBe(mockExtractTenantContext);
      expect(calls[3]).toBe(mockValidateRequest(mockBrainstormValidation.getConversationHistorySchema));
      expect(calls[4]).toBe(mockBrainstormController.getConversationHistory);
    });
  });

  describe('POST /export', () => {
    it('should define the POST /export route with correct middlewares and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/export',
        expect.any(Function), // auth()
        mockExtractTenantContext,
        expect.any(Function), // createRateLimiter()
        expect.any(Function), // validateRequest()
        mockBrainstormController.exportBrainstorm
      );

      expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(10, 15);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockBrainstormValidation.exportBrainstormSchema);

      // Verify the order of middlewares passed to router.post
      const calls = mockRouter.post.mock.calls.find(call => call[0] === '/export');
      expect(calls[1]).toBe(mockAuth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN));
      expect(calls[2]).toBe(mockExtractTenantContext);
      expect(calls[3]).toBe(mockCreateRateLimiter(10, 15));
      expect(calls[4]).toBe(mockValidateRequest(mockBrainstormValidation.exportBrainstormSchema));
      expect(calls[5]).toBe(mockBrainstormController.exportBrainstorm);
    });
  });

  describe('POST /refine', () => {
    it('should define the POST /refine route with correct middlewares and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/refine',
        expect.any(Function), // auth()
        mockExtractTenantContext,
        expect.any(Function), // createRateLimiter()
        expect.any(Function), // validateRequest()
        mockBrainstormController.refineBrainstorm
      );

      expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(20, 15);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockBrainstormValidation.refineBrainstormSchema);

      // Verify the order of middlewares passed to router.post
      const calls = mockRouter.post.mock.calls.find(call => call[0] === '/refine');
      expect(calls[1]).toBe(mockAuth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN));
      expect(calls[2]).toBe(mockExtractTenantContext);
      expect(calls[3]).toBe(mockCreateRateLimiter(20, 15));
      expect(calls[4]).toBe(mockValidateRequest(mockBrainstormValidation.refineBrainstormSchema));
      expect(calls[5]).toBe(mockBrainstormController.refineBrainstorm);
    });
  });
});