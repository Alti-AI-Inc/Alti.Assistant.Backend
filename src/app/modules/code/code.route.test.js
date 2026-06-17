import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const {
  mockRouter,
  mockExpress,
  mockAuth,
  mockOptionalAuth,
  mockCreateRateLimiter,
  mockValidateRequest,
  mockCheckDailyRequestLimit,
  mockExtractTenantContext,
  mockCodeController,
  mockCodeValidation,
  mockPerformCodeTask,
  mockGetCodeStats,
  mockCodeQuerySchema,
  mockAuthMiddleware,
  mockOptionalAuthMiddleware,
  mockCreateRateLimiterMiddleware,
  mockValidateRequestMiddleware,
} = vi.hoisted(() => {
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
  };
  const mockExpress = {
    Router: vi.fn().mockImplementation(() => mockRouter),
  };

  const mockAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next());
  const mockOptionalAuthMiddleware = vi.fn().mockImplementation((req, res, next) => next());
  const mockCreateRateLimiterMiddleware = vi.fn().mockImplementation((req, res, next) => next());
  const mockValidateRequestMiddleware = vi.fn().mockImplementation((req, res, next) => next());

  const mockAuth = vi.fn().mockImplementation((...roles) => mockAuthMiddleware);
  const mockOptionalAuth = vi.fn().mockImplementation(() => mockOptionalAuthMiddleware);
  const mockCreateRateLimiter = vi.fn().mockImplementation((limit, window) => mockCreateRateLimiterMiddleware);
  const mockValidateRequest = vi.fn().mockImplementation((schema) => mockValidateRequestMiddleware);

  // Direct middleware functions
  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());

  const mockPerformCodeTask = vi.fn();
  const mockGetCodeStats = vi.fn();
  const mockCodeController = {
    performCodeTask: mockPerformCodeTask,
    getCodeStats: mockGetCodeStats,
  };
  
  const mockCodeQuerySchema = {
    body: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        language: { type: 'string' },
        context: { type: 'string' },
      },
      required: ['prompt'],
    },
  };
  const mockCodeValidation = {
    CodeValidation: {
      codeQuerySchema: mockCodeQuerySchema,
    },
  };

  return {
    mockRouter,
    mockExpress,
    mockAuth,
    mockOptionalAuth,
    mockCreateRateLimiter,
    mockValidateRequest,
    mockCheckDailyRequestLimit,
    mockExtractTenantContext,
    mockCodeController,
    mockCodeValidation,
    mockPerformCodeTask,
    mockGetCodeStats,
    mockCodeQuerySchema,
    mockAuthMiddleware,
    mockOptionalAuthMiddleware,
    mockCreateRateLimiterMiddleware,
    mockValidateRequestMiddleware,
  };
});

vi.mock('express', () => ({ default: mockExpress }));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    ADMIN: 'admin',
    USER: 'user',
  },
}));
vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: mockCreateRateLimiter }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));

vi.mock('./code.controller.js', () => ({ codeController: mockCodeController }));
vi.mock('./code.validation.js', () => (mockCodeValidation));

describe('code.route', () => {
  let codeRoutes;

  beforeAll(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const module = await import('./code.route.js');
    codeRoutes = module.codeRoutes;
  });

  it('should initialize the router correctly', () => {
    expect(mockExpress.Router).toHaveBeenCalledTimes(1);
    expect(codeRoutes).toBe(mockRouter); // Ensure the exported router is our mocked instance
  });

  describe('POST /assistant', () => {
    it('should define the /assistant route with correct middleware and controller', () => {
      // Check that router.post was called
      expect(mockRouter.post).toHaveBeenCalledTimes(1);
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/assistant',
        mockOptionalAuthMiddleware, // The middleware function returned by optionalAuth()
        mockExtractTenantContext,
        mockCreateRateLimiterMiddleware, // The middleware function returned by createRateLimiter(30, 15)
        mockCheckDailyRequestLimit,
        mockValidateRequestMiddleware, // The middleware function returned by validateRequest(CodeValidation.codeQuerySchema)
        mockCodeController.performCodeTask
      );

      // Verify specific middleware factory calls and their arguments
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
      expect(mockOptionalAuth).toHaveBeenCalledWith(); // Called without arguments

      expect(mockCreateRateLimiter).toHaveBeenCalledTimes(1);
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(30, 15);

      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockCodeValidation.CodeValidation.codeQuerySchema);
    });
  });

  describe('GET /stats', () => {
    it('should define the /stats route with correct middleware and controller', () => {
      // Check that router.get was called
      expect(mockRouter.get).toHaveBeenCalledTimes(1);
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/stats',
        mockAuthMiddleware, // The middleware function returned by auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER)
        mockExtractTenantContext,
        mockCodeController.getCodeStats
      );

      // Verify specific middleware factory calls and their arguments
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith('admin', 'user'); // Called with specific roles
    });
  });
});