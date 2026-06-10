import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock express and its Router
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock multer
const mockMulterSingleMiddleware = vi.fn((req, res, next) => next()); // The middleware returned by upload.single()
const mockMulterInstance = { // The object returned by multer()
  single: vi.fn(() => mockMulterSingleMiddleware),
};
const mockMulter = vi.fn(() => mockMulterInstance); // The multer constructor
mockMulter.memoryStorage = vi.fn(); // Mock memoryStorage static method
vi.mock('multer', () => ({
  default: mockMulter,
}));

// Mock all middleware functions
const mockAuth = vi.fn(() => vi.fn((req, res, next) => next()));
const mockOptionalAuth = vi.fn(() => vi.fn((req, res, next) => next()));
const mockExtractTenantContext = vi.fn((req, res, next) => next());
const mockCreateRateLimiter = vi.fn(() => vi.fn((req, res, next) => next()));
const mockValidateRequest = vi.fn((schema) => vi.fn((req, res, next) => next()));
const mockCheckDailyRequestLimit = vi.fn((req, res, next) => next());
const mockCheckRAGFeature = vi.fn((req, res, next) => next());
const mockCheckStorageLimit = vi.fn((req, res, next) => next());

vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: mockCreateRateLimiter }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({ default: mockCheckRAGFeature }));
vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({ default: mockCheckStorageLimit }));

// Mock controller
const mockSummaryController = {
  summarizeContent: vi.fn(),
  getSummaryStats: vi.fn(),
};
vi.mock('./summary.controller.js', () => ({ summaryController: mockSummaryController }));

// Mock validation schema
const mockSummaryValidation = {
  summaryQuerySchema: { /* mock schema content if needed for validateRequest */ },
};
vi.mock('./summary.validation.js', () => ({ SummaryValidation: mockSummaryValidation }));

// Mock ENUM_USER_ROLE
const mockEnumUserRole = {
  ADMIN: 'admin',
  USER: 'user',
};
vi.mock('../../../shared/enum.js', () => ({ ENUM_USER_ROLE: mockEnumUserRole }));

// Import the module under test AFTER all mocks are defined
import { summaryRoutes } from './summary.route.js';

describe('summary.route', () => {
  beforeEach(() => {
    // Clear all mock calls before each test
    mockRouter.post.mockClear();
    mockRouter.get.mockClear();
    mockAuth.mockClear();
    mockOptionalAuth.mockClear();
    mockExtractTenantContext.mockClear();
    mockCreateRateLimiter.mockClear();
    mockValidateRequest.mockClear();
    mockCheckDailyRequestLimit.mockClear();
    mockCheckRAGFeature.mockClear();
    mockCheckStorageLimit.mockClear();
    mockSummaryController.summarizeContent.mockClear();
    mockSummaryController.getSummaryStats.mockClear();
    mockMulter.mockClear();
    mockMulter.memoryStorage.mockClear();
    mockMulterInstance.single.mockClear(); // Clear the single method on the *returned* multer instance
    mockMulterSingleMiddleware.mockClear();
  });

  it('should export the router', () => {
    expect(summaryRoutes).toBe(mockRouter);
  });

  describe('POST /summarize', () => {
    it('should define the POST /summarize route with correct middleware and controller', () => {
      // Expect router.post to be called once with the correct path and handlers
      expect(mockRouter.post).toHaveBeenCalledTimes(1);
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/summarize',
        expect.any(Function), // optionalAuth()
        expect.any(Function), // extractTenantContext
        expect.any(Function), // checkDailyRequestLimit
        expect.any(Function), // checkStorageLimit
        expect.any(Function), // upload.single('file')
        expect.any(Function), // checkRAGFeature
        expect.any(Function), // validateRequest(SummaryValidation.summaryQuerySchema)
        mockSummaryController.summarizeContent
      );

      const calls = mockRouter.post.mock.calls[0];
      const middlewareFunctions = calls.slice(1, -1); // Exclude path and final controller

      expect(middlewareFunctions).toHaveLength(7); // 7 middleware functions

      // Verify specific middleware calls and their order
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
      expect(middlewareFunctions[0]).toBe(mockOptionalAuth()); // Check if the *returned* middleware is used

      expect(middlewareFunctions[1]).toBe(mockExtractTenantContext);
      expect(middlewareFunctions[2]).toBe(mockCheckDailyRequestLimit);
      expect(middlewareFunctions[3]).toBe(mockCheckStorageLimit);

      // Multer specific check
      expect(mockMulterInstance.single).toHaveBeenCalledWith('file');
      expect(middlewareFunctions[4]).toBe(mockMulterSingleMiddleware); // The middleware returned by upload.single

      expect(middlewareFunctions[5]).toBe(mockCheckRAGFeature);

      expect(mockValidateRequest).toHaveBeenCalledWith(mockSummaryValidation.summaryQuerySchema);
      expect(middlewareFunctions[6]).toBe(mockValidateRequest()); // Check if the *returned* middleware is used

      expect(calls[calls.length - 1]).toBe(mockSummaryController.summarizeContent);

      // Ensure rate limiter is NOT called as it's commented out in the route file
      expect(mockCreateRateLimiter).not.toHaveBeenCalled();
    });

    it('should configure multer with correct storage, limits, and fileFilter', () => {
      // The multer configuration happens when the module is loaded.
      // We need to inspect the arguments passed to `multer()`.
      expect(mockMulter).toHaveBeenCalledTimes(1);
      const multerConfig = mockMulter.mock.calls[0][0];

      expect(multerConfig).toBeDefined();
      expect(multerConfig.storage).toBeDefined();
      expect(mockMulter.memoryStorage).toHaveBeenCalledTimes(1); // Ensure memoryStorage was used
      expect(multerConfig.limits).toEqual({ fileSize: 10 * 1024 * 1024 }); // 10 MB
      expect(multerConfig.fileFilter).toBeInstanceOf(Function);

      const fileFilter = multerConfig.fileFilter;
      const mockCb = vi.fn();

      // Test allowed types
      const allowedMimeTypes = [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv',
      ];

      allowedMimeTypes.forEach(mimetype => {
        fileFilter({}, { mimetype }, mockCb);
        expect(mockCb).toHaveBeenCalledWith(null, true);
        mockCb.mockClear();
      });

      // Test disallowed type
      fileFilter({}, { mimetype: 'image/jpeg' }, mockCb);
      expect(mockCb).toHaveBeenCalledWith(expect.any(Error), false);
      expect(mockCb.mock.calls[0][0].message).toBe('Unsupported file type');
      mockCb.mockClear();

      fileFilter({}, { mimetype: 'application/zip' }, mockCb);
      expect(mockCb).toHaveBeenCalledWith(expect.any(Error), false);
      expect(mockCb.mock.calls[0][0].message).toBe('Unsupported file type');
      mockCb.mockClear();
    });
  });

  describe('GET /stats', () => {
    it('should define the GET /stats route with correct middleware and controller', () => {
      // Expect router.get to be called once with the correct path and handlers
      expect(mockRouter.get).toHaveBeenCalledTimes(1);
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/stats',
        expect.any(Function), // auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER)
        expect.any(Function), // extractTenantContext
        mockSummaryController.getSummaryStats
      );

      const calls = mockRouter.get.mock.calls[0];
      const middlewareFunctions = calls.slice(1, -1); // Exclude path and final controller

      expect(middlewareFunctions).toHaveLength(2); // 2 middleware functions

      // Verify specific middleware calls and their order
      expect(mockAuth).toHaveBeenCalledWith(mockEnumUserRole.ADMIN, mockEnumUserRole.USER);
      expect(middlewareFunctions[0]).toBe(mockAuth()); // Check if the *returned* middleware is used

      expect(middlewareFunctions[1]).toBe(mockExtractTenantContext);

      expect(calls[calls.length - 1]).toBe(mockSummaryController.getSummaryStats);
    });
  });
});