import { vi, describe, it, expect } from 'vitest';

// Mock express to capture router calls
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock ENUM_USER_ROLE
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    ADMIN: 'admin',
    USER: 'user',
  },
}));

// Mock all middleware functions
const mockAuthMiddleware = vi.fn(() => vi.fn((req, res, next) => next()));
vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuthMiddleware }));

const mockOptionalAuthMiddleware = vi.fn(() => vi.fn((req, res, next) => next()));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuthMiddleware }));

const mockCheckDailyRequestLimit = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));

// createRateLimiter is commented out in the source file, so we won't mock it.
// If it were active, it would be mocked as:
// const mockCreateRateLimiter = vi.fn((limit, window) => vi.fn((req, res, next) => next()));
// vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: mockCreateRateLimiter }));

const mockValidateRequest = vi.fn((schema) => vi.fn((req, res, next) => next()));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));

const mockExtractTenantContext = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));

const mockCheckWebSearchLimit = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/checkSubscriptionLimits.js', () => ({ checkWebSearchLimit: mockCheckWebSearchLimit }));

// Mock searchController methods
const mockSearchController = {
  performSearch: vi.fn(),
  generateCode: vi.fn(),
  generateWriting: vi.fn(),
  getSearchStats: vi.fn(),
  performNativeGroundingSearch: vi.fn(),
  performStreamingSearch: vi.fn(),
};
vi.mock('./search.controller.js', () => ({ searchController: mockSearchController }));

// Mock SearchValidation schema
const mockSearchQuerySchema = {
  // A simple mock object representing the schema that validateRequest expects
  body: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
  },
};
vi.mock('./search.validation.js', () => ({ SearchValidation: { searchQuerySchema: mockSearchQuerySchema } }));

// Import the router after all mocks are set up.
// This will execute the route definitions and populate mockRouter.post/get calls.
import { searchRoute } from './search.route.js';

describe('Search Routes', () => {
  // Ensure the router instance exported is the one we mocked
  it('should export the mocked router instance', () => {
    expect(searchRoute).toBe(mockRouter);
  });

  // Test /assistant_v2 POST route
  it('should define the /assistant_v2 POST route with optionalAuth, tenant context, limits, validation, and performSearch controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/assistant_v2',
      mockOptionalAuthMiddleware(), // This is the middleware function returned by optionalAuth()
      mockExtractTenantContext,
      mockCheckWebSearchLimit,
      mockCheckDailyRequestLimit,
      mockValidateRequest(mockSearchQuerySchema), // This is the middleware function returned by validateRequest()
      mockSearchController.performSearch
    );
  });

  // Test /code POST route
  it('should define the /code POST route with optionalAuth, tenant context, limits, validation, and generateCode controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/code',
      mockOptionalAuthMiddleware(),
      mockExtractTenantContext,
      mockCheckWebSearchLimit,
      mockCheckDailyRequestLimit,
      mockValidateRequest(mockSearchQuerySchema),
      mockSearchController.generateCode
    );
  });

  // Test /writing POST route
  it('should define the /writing POST route with optionalAuth, tenant context, limits, validation, and generateWriting controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/writing',
      mockOptionalAuthMiddleware(),
      mockExtractTenantContext,
      mockCheckWebSearchLimit,
      mockCheckDailyRequestLimit,
      mockValidateRequest(mockSearchQuerySchema),
      mockSearchController.generateWriting
    );
  });

  // Test /stats GET route
  it('should define the /stats GET route with auth for ADMIN/USER, tenant context, and getSearchStats controller', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/stats',
      mockAuthMiddleware('admin', 'user'), // ENUM_USER_ROLE values are mocked to 'admin' and 'user'
      mockExtractTenantContext,
      mockSearchController.getSearchStats
    );
  });

  // Test /assistant POST route (native grounding)
  it('should define the /assistant POST route with optionalAuth, tenant context, web search limit, validation, and performNativeGroundingSearch controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/assistant',
      mockOptionalAuthMiddleware(),
      mockExtractTenantContext,
      mockCheckWebSearchLimit,
      mockValidateRequest(mockSearchQuerySchema),
      mockSearchController.performNativeGroundingSearch
    );
  });

  // Test /stream POST route
  it('should define the /stream POST route with optionalAuth, tenant context, web search limit, validation, and performStreamingSearch controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/stream',
      mockOptionalAuthMiddleware(),
      mockExtractTenantContext,
      mockCheckWebSearchLimit,
      mockValidateRequest(mockSearchQuerySchema),
      mockSearchController.performStreamingSearch
    );
  });

  // Verify total calls to post and get methods on the router
  it('should have defined 6 POST routes and 1 GET route', () => {
    expect(mockRouter.post).toHaveBeenCalledTimes(6);
    expect(mockRouter.get).toHaveBeenCalledTimes(1);
  });
});