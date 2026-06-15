import { describe, it, expect, vi } from 'vitest';

// Mock all dependencies
const mockExpressRouter = {
  get: vi.fn(),
  post: vi.fn(),
};

const {
  mockExpress,
  ENUM_USER_ROLE,
  mockAuth,
  mockOptionalAuth,
  mockExtractTenantContext,
  mockCreateRateLimiter,
  mockValidateRequest,
  mockCheckDeepResearchLimit
} = vi.hoisted(() => {
  const mockExpress = {
    Router: vi.fn().mockImplementation(() => mockExpressRouter),
  };

  const ENUM_USER_ROLE = {
    ADMIN: 'admin',
    USER: 'user',
  };
  const mockAuth = vi.fn().mockImplementation(() => mockAuthMiddleware); // auth is a factory function
  const mockOptionalAuth = vi.fn().mockImplementation(() => mockOptionalAuthMiddleware); // optionalAuth is a factory function

  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());
  const mockCreateRateLimiter = vi.fn().mockImplementation((limit, window) => mockRateLimiterMiddleware); // createRateLimiter is a factory function
  const mockValidateRequest = vi.fn().mockImplementation((schema) => mockValidateRequestMiddleware); // validateRequest is a factory function

  const mockCheckDeepResearchLimit = vi.fn().mockImplementation((req, res, next) => next());

  return {
    mockExpress,
    ENUM_USER_ROLE,
    mockAuth,
    mockOptionalAuth,
    mockExtractTenantContext,
    mockCreateRateLimiter,
    mockValidateRequest,
    mockCheckDeepResearchLimit
  };
});

vi.mock('express', () => ({ default: mockExpress }));

vi.mock('../../../shared/enum.js', () => ({ ENUM_USER_ROLE }));

const mockAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next()); // Actual middleware function returned by auth() factory
vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));

const mockOptionalAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next()); // Actual middleware function returned by optionalAuth() factory
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));

const mockRateLimiterMiddleware = vi.fn().mockImplementation((req, res, next) => next()); // Actual middleware function returned by createRateLimiter() factory
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: mockCreateRateLimiter }));

const mockValidateRequestMiddleware = vi.fn().mockImplementation((req, res, next) => next()); // Actual middleware function returned by validateRequest() factory
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));

vi.mock('../../middlewares/checkSubscriptionLimits.js', () => ({ checkDeepResearchLimit: mockCheckDeepResearchLimit }));

const mockPerformDeepResearch = vi.fn();
const mockTelemetryStream = vi.fn();
const mockGetDeepResearchStats = vi.fn();
const mockDownloadPDF = vi.fn();
const mockDownloadPPTX = vi.fn();
const deepResearchController = {
  performDeepResearch: mockPerformDeepResearch,
  telemetryStream: mockTelemetryStream,
  getDeepResearchStats: mockGetDeepResearchStats,
  downloadPDF: mockDownloadPDF,
  downloadPPTX: mockDownloadPPTX,
};
vi.mock('./deep_research.controller.js', () => ({ deepResearchController }));

const mockDeepResearchQuerySchema = { type: 'object', properties: { query: { type: 'string' } } }; // Simple mock for the schema
const DeepResearchValidation = {
  deepResearchQuerySchema: mockDeepResearchQuerySchema,
};
vi.mock('./deep_research.validation.js', () => ({ DeepResearchValidation }));

// Import the router *after* all mocks are set up.
// This will trigger the router definition and populate the mockExpressRouter.get/post calls.
import { deepResearchRoute } from './deep_research.route.js';

describe('deepResearchRoute', () => {
  it('should create an Express router instance', () => {
    expect(mockExpress.Router).toHaveBeenCalledTimes(1);
    expect(deepResearchRoute).toBe(mockExpressRouter);
  });

  it('should define all deep research routes', () => {
    // Check total calls to get and post methods on the router
    expect(mockExpressRouter.post).toHaveBeenCalledTimes(1);
    expect(mockExpressRouter.get).toHaveBeenCalledTimes(4); // /telemetry, /stats, /download-pdf/:savedId, /download-pptx/:savedId
  });

  describe('POST /assistant route', () => {
    it('should define the POST /assistant route with the correct path and middleware chain', () => {
      expect(mockExpressRouter.post).toHaveBeenCalledWith(
        '/assistant',
        mockOptionalAuthMiddleware,
        mockExtractTenantContext,
        mockCheckDeepResearchLimit,
        mockRateLimiterMiddleware,
        mockValidateRequestMiddleware,
        deepResearchController.performDeepResearch
      );

      // Verify the factory functions were called with correct arguments
      expect(mockOptionalAuth).toHaveBeenCalledWith();
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(10, 15);
      expect(mockValidateRequest).toHaveBeenCalledWith(DeepResearchValidation.deepResearchQuerySchema);
    });
  });

  describe('GET /telemetry route', () => {
    it('should define the GET /telemetry route with the correct path and middleware chain', () => {
      expect(mockExpressRouter.get).toHaveBeenCalledWith(
        '/telemetry',
        mockOptionalAuthMiddleware,
        mockExtractTenantContext,
        deepResearchController.telemetryStream
      );
      // The mockOptionalAuth factory is called multiple times, so we don't assert its call count here,
      // but rather that the correct middleware instance is in the chain.
    });
  });

  describe('GET /stats route', () => {
    it('should define the GET /stats route with the correct path and middleware chain, including auth roles', () => {
      expect(mockExpressRouter.get).toHaveBeenCalledWith(
        '/stats',
        mockAuthMiddleware,
        mockExtractTenantContext,
        deepResearchController.getDeepResearchStats
      );

      // Verify auth factory was called with correct roles
      expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });
  });

  describe('GET /download-pdf/:savedId route', () => {
    it('should define the GET /download-pdf/:savedId route with the correct path and middleware chain', () => {
      expect(mockExpressRouter.get).toHaveBeenCalledWith(
        '/download-pdf/:savedId',
        mockOptionalAuthMiddleware,
        mockExtractTenantContext,
        deepResearchController.downloadPDF
      );
    });
  });

  describe('GET /download-pptx/:savedId route', () => {
    it('should define the GET /download-pptx/:savedId route with the correct path and middleware chain', () => {
      expect(mockExpressRouter.get).toHaveBeenCalledWith(
        '/download-pptx/:savedId',
        mockOptionalAuthMiddleware,
        mockExtractTenantContext,
        deepResearchController.downloadPPTX
      );
    });
  });
});