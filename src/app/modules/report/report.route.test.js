import { describe, it, expect, vi } from 'vitest';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

const {
  mockRouter
} = vi.hoisted(() => {
  // --- Mocks ---

  // Mock Express Router
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
  };

  return {
    mockRouter
  };
});
vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

// Mock Middlewares and their factories
const auth = vi.fn().mockImplementation((...roles) => `auth(${roles.join(',')})`);
vi.mock('../../middlewares/auth/auth.js', () => ({ default: auth }));

const optionalAuth = vi.fn().mockImplementation(() => 'optionalAuthMiddleware');
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: optionalAuth }));

const checkDailyRequestLimit = 'checkDailyRequestLimitMiddleware';
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: checkDailyRequestLimit,
}));

const createRateLimiter = vi.fn().mockImplementation((max, mins) => `rateLimiter(${max},${mins})`);
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: createRateLimiter,
}));

const validateRequest = vi.fn().mockImplementation(schema => `validateRequest(${schema})`);
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest,
}));

const extractTenantContext = 'extractTenantContextMiddleware';
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext,
}));

const uploadReportFiles = 'uploadReportFilesMiddleware';
vi.mock('./middlewares/uploadReportFiles.js', () => ({
  uploadReportFiles,
}));

const checkRAGFeature = 'checkRAGFeatureMiddleware';
vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: checkRAGFeature,
}));

const checkStorageLimit = 'checkStorageLimitMiddleware';
vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: checkStorageLimit,
}));

// Mock Controller
const reportController = {
  conversationalAssistant: 'conversationalAssistantController',
  generateReport: 'generateReportController',
  analyzeFiles: 'analyzeFilesController',
  downloadReport: 'downloadReportController',
  exportReport: 'exportReportController',
  getReport: 'getReportController',
  listReports: 'listReportsController',
  modifyReport: 'modifyReportController',
};
vi.mock('./report.controller.js', () => ({ reportController }));

// Mock Validation Schemas
const ReportValidation = {
  conversationalRequestSchema: 'conversationalRequestSchema',
  generateReportSchema: 'generateReportSchema',
  analyzeFilesSchema: 'analyzeFilesSchema',
  exportReportSchema: 'exportReportSchema',
  getReportSchema: 'getReportSchema',
  listReportsSchema: 'listReportsSchema',
  modifyReportSchema: 'modifyReportSchema',
};
vi.mock('./report.validation.js', () => ({ ReportValidation }));

// --- Test Suite ---

describe('Report Routes', () => {
  // Import the router to trigger the route definitions on the mocked router
  import('./report.route.js');

  describe('POST /assistant', () => {
    it('should be configured with correct middlewares and controller', () => {
      const routeArgs = mockRouter.post.mock.calls.find(
        call => call[0] === '/assistant'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      expect(middlewares).toEqual([
        'rateLimiter(20,15)',
        'optionalAuthMiddleware',
        extractTenantContext,
        checkDailyRequestLimit,
        checkStorageLimit,
        uploadReportFiles,
        checkRAGFeature,
        `validateRequest(${ReportValidation.conversationalRequestSchema})`,
        reportController.conversationalAssistant,
      ]);
    });
  });

  describe('POST /generate', () => {
    it('should be configured with correct middlewares and controller', () => {
      const routeArgs = mockRouter.post.mock.calls.find(
        call => call[0] === '/generate'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      expect(middlewares).toEqual([
        'rateLimiter(10,15)',
        'optionalAuthMiddleware',
        extractTenantContext,
        `validateRequest(${ReportValidation.generateReportSchema})`,
        reportController.generateReport,
      ]);
    });
  });

  describe('POST /analyze', () => {
    it('should be configured with correct middlewares and controller', () => {
      const routeArgs = mockRouter.post.mock.calls.find(
        call => call[0] === '/analyze'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      expect(middlewares).toEqual([
        'rateLimiter(15,15)',
        'optionalAuthMiddleware',
        checkDailyRequestLimit,
        checkStorageLimit,
        uploadReportFiles,
        checkRAGFeature,
        `validateRequest(${ReportValidation.analyzeFilesSchema})`,
        reportController.analyzeFiles,
      ]);
    });
  });

  describe('GET /download/:filename', () => {
    it('should be configured with correct middlewares and controller', () => {
      const routeArgs = mockRouter.get.mock.calls.find(
        call => call[0] === '/download/:filename'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      expect(middlewares).toEqual([
        'rateLimiter(30,1)',
        reportController.downloadReport,
      ]);
    });
  });

  describe('POST /export', () => {
    it('should be configured with correct middlewares, auth checks, and controller', () => {
      const routeArgs = mockRouter.post.mock.calls.find(
        call => call[0] === '/export'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      const expectedRoles = `auth(${ENUM_USER_ROLE.USER},${ENUM_USER_ROLE.ADMIN})`;

      expect(middlewares).toEqual([
        'rateLimiter(10,15)',
        expectedRoles,
        `validateRequest(${ReportValidation.exportReportSchema})`,
        reportController.exportReport,
      ]);
    });
  });

  describe('GET /:reportId', () => {
    it('should be configured with correct middlewares, auth checks, and controller', () => {
      const routeArgs = mockRouter.get.mock.calls.find(
        call => call[0] === '/:reportId'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      const expectedRoles = `auth(${ENUM_USER_ROLE.USER},${ENUM_USER_ROLE.ADMIN})`;

      expect(middlewares).toEqual([
        'rateLimiter(60,1)',
        expectedRoles,
        `validateRequest(${ReportValidation.getReportSchema})`,
        reportController.getReport,
      ]);
    });
  });

  describe('GET /', () => {
    it('should be configured with correct middlewares, auth checks, and controller', () => {
      const routeArgs = mockRouter.get.mock.calls.find(call => call[0] === '/');
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      const expectedRoles = `auth(${ENUM_USER_ROLE.USER},${ENUM_USER_ROLE.ADMIN})`;

      expect(middlewares).toEqual([
        'rateLimiter(60,1)',
        expectedRoles,
        `validateRequest(${ReportValidation.listReportsSchema})`,
        reportController.listReports,
      ]);
    });
  });

  describe('POST /modify', () => {
    it('should be configured with correct middlewares, auth checks, and controller', () => {
      const routeArgs = mockRouter.post.mock.calls.find(
        call => call[0] === '/modify'
      );
      expect(routeArgs).toBeDefined();

      const middlewares = routeArgs.slice(1);
      const expectedRoles = `auth(${ENUM_USER_ROLE.USER},${ENUM_USER_ROLE.ADMIN})`;

      expect(middlewares).toEqual([
        'rateLimiter(60,1)',
        expectedRoles,
        `validateRequest(${ReportValidation.modifyReportSchema})`,
        reportController.modifyReport,
      ]);
    });
  });
});