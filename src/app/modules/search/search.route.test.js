import { vi, describe, it, expect } from 'vitest';

const {
  mockRouter,
  mockAuthMiddleware,
  mockAuthMiddlewareInstance,
  mockOptionalAuthMiddleware,
  mockOptionalAuthMiddlewareInstance,
  mockCheckDailyRequestLimit,
  mockValidateRequest,
  mockValidateRequestInstance,
  mockExtractTenantContext,
  mockPlanLimitMiddleware,
  mockPlanLimitMiddlewareInstance,
  mockSearchController,
  mockSearchQuerySchema
} = vi.hoisted(() => {
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
  };

  const mockAuthMiddlewareInstance = vi.fn().mockImplementation((req, res, next) => next());
  const mockAuthMiddleware = vi.fn().mockImplementation(() => mockAuthMiddlewareInstance);

  const mockOptionalAuthMiddlewareInstance = vi.fn().mockImplementation((req, res, next) => next());
  const mockOptionalAuthMiddleware = vi.fn().mockImplementation(() => mockOptionalAuthMiddlewareInstance);

  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());

  const mockValidateRequestInstance = vi.fn().mockImplementation((req, res, next) => next());
  const mockValidateRequest = vi.fn().mockImplementation(() => mockValidateRequestInstance);

  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());

  const mockPlanLimitMiddlewareInstance = vi.fn().mockImplementation((req, res, next) => next());
  const mockPlanLimitMiddleware = vi.fn().mockImplementation(() => mockPlanLimitMiddlewareInstance);

  const mockSearchController = {
    performSearch: vi.fn(),
    generateCode: vi.fn(),
    generateWriting: vi.fn(),
    getSearchStats: vi.fn(),
    performNativeGroundingSearch: vi.fn(),
    performStreamingSearch: vi.fn(),
  };

  const mockSearchQuerySchema = {
    body: {
      type: 'object',
      properties: {
        query: { type: 'string' },
      },
    },
  };

  return {
    mockRouter,
    mockAuthMiddleware,
    mockAuthMiddlewareInstance,
    mockOptionalAuthMiddleware,
    mockOptionalAuthMiddlewareInstance,
    mockCheckDailyRequestLimit,
    mockValidateRequest,
    mockValidateRequestInstance,
    mockExtractTenantContext,
    mockPlanLimitMiddleware,
    mockPlanLimitMiddlewareInstance,
    mockSearchController,
    mockSearchQuerySchema
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    ADMIN: 'admin',
    USER: 'user',
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuthMiddleware }));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuthMiddleware }));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));
vi.mock('../billing/planLimit.middleware.js', () => ({ planLimitMiddleware: mockPlanLimitMiddleware }));
vi.mock('./search.controller.js', () => ({ searchController: mockSearchController }));
vi.mock('./search.validation.js', () => ({ SearchValidation: { searchQuerySchema: mockSearchQuerySchema } }));

import { searchRoute } from './search.route.js';

describe('Search Routes', () => {
  it('should export the mocked router instance', () => {
    expect(searchRoute).toBe(mockRouter);
  });

  it('should define the /assistant_v2 POST route with optionalAuth, tenant context, limits, validation, and performSearch controller', () => {
    expect(mockPlanLimitMiddleware).toHaveBeenCalledWith('search');
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/assistant_v2',
      mockOptionalAuthMiddlewareInstance,
      mockExtractTenantContext,
      mockPlanLimitMiddlewareInstance,
      mockCheckDailyRequestLimit,
      mockValidateRequestInstance,
      mockSearchController.performSearch
    );
  });

  it('should define the /code POST route with optionalAuth, tenant context, limits, validation, and generateCode controller', () => {
    expect(mockPlanLimitMiddleware).toHaveBeenCalledWith('code');
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/code',
      mockOptionalAuthMiddlewareInstance,
      mockExtractTenantContext,
      mockPlanLimitMiddlewareInstance,
      mockCheckDailyRequestLimit,
      mockValidateRequestInstance,
      mockSearchController.generateCode
    );
  });

  it('should define the /writing POST route with optionalAuth, tenant context, limits, validation, and generateWriting controller', () => {
    expect(mockPlanLimitMiddleware).toHaveBeenCalledWith('write');
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/writing',
      mockOptionalAuthMiddlewareInstance,
      mockExtractTenantContext,
      mockPlanLimitMiddlewareInstance,
      mockCheckDailyRequestLimit,
      mockValidateRequestInstance,
      mockSearchController.generateWriting
    );
  });

  it('should define the /stats GET route with auth for ADMIN/USER, tenant context, and getSearchStats controller', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/stats',
      mockAuthMiddlewareInstance,
      mockExtractTenantContext,
      mockSearchController.getSearchStats
    );
  });

  it('should define the /assistant POST route with optionalAuth, tenant context, web search limit, validation, and performNativeGroundingSearch controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/assistant',
      mockOptionalAuthMiddlewareInstance,
      mockExtractTenantContext,
      mockPlanLimitMiddlewareInstance,
      mockValidateRequestInstance,
      mockSearchController.performNativeGroundingSearch
    );
  });

  it('should define the /stream POST route with optionalAuth, tenant context, web search limit, validation, and performStreamingSearch controller', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/stream',
      mockOptionalAuthMiddlewareInstance,
      mockExtractTenantContext,
      mockPlanLimitMiddlewareInstance,
      mockValidateRequestInstance,
      mockSearchController.performStreamingSearch
    );
  });

  it('should have defined 5 POST routes and 1 GET route', () => {
    expect(mockRouter.post).toHaveBeenCalledTimes(5);
    expect(mockRouter.get).toHaveBeenCalledTimes(1);
  });
});