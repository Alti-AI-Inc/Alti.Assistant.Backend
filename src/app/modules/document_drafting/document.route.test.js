import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// --- Mock Dependencies ---

// Mock Express to spy on router and app creation/usage
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  use: vi.fn(),
};
const mockApp = {
  use: vi.fn(),
  get: vi.fn(),
  listen: vi.fn(),
};
vi.mock('express', () => ({
  default: vi.fn(() => mockApp),
  Router: vi.fn(() => mockRouter),
}));

// Mock Middlewares
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn((...roles) => `authMiddleware(${roles.join(',')})`),
}));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => 'optionalAuthMiddleware'),
}));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: vi.fn(() => 'extractTenantContextMiddleware'),
}));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: vi.fn(() => 'checkDailyRequestLimitMiddleware'),
}));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: vi.fn((limit, window) => `rateLimiterMiddleware(${limit},${window})`),
}));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: vi.fn(schema => `validateRequestMiddleware(${schema.name})`),
}));

// Mock Controller
vi.mock('./document.controller.js', () => ({
  documentController: {
    conversationalAssistant: vi.fn(() => 'conversationalAssistantController'),
    generateDocument: vi.fn(() => 'generateDocumentController'),
    exportDocument: vi.fn(() => 'exportDocumentController'),
    editDocument: vi.fn(() => 'editDocumentController'),
  },
}));

// Mock Validation Schemas
vi.mock('./document.validation.js', () => ({
  DocumentValidation: {
    conversationalRequestSchema: { name: 'conversationalRequestSchema' },
    generateDocumentSchema: { name: 'generateDocumentSchema' },
    exportDocumentSchema: { name: 'exportDocumentSchema' },
    editDocumentSchema: { name: 'editDocumentSchema' },
  },
}));

// Mock server lifecycle components to prevent side effects
vi.mock('http', () => ({
  default: {
    createServer: vi.fn(() => ({
      listen: vi.fn(),
      close: vi.fn(cb => cb()),
    })),
  },
}));

// --- Test Suite ---

describe('Document Drafting Routes', () => {
  let express;
  let optionalAuth;
  let extractTenantContext;
  let checkDailyRequestLimit;
  let createRateLimiter;
  let validateRequest;
  let documentController;
  let DocumentValidation;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import mocked modules to get fresh instances for assertions
    express = (await import('express')).default;
    optionalAuth = (await import('../../middlewares/auth/optionalAuth.js')).default;
    extractTenantContext = (await import('../../middlewares/tenant/tenantContext.js')).extractTenantContext;
    checkDailyRequestLimit = (await import('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js')).default;
    createRateLimiter = (await import('../../middlewares/rateLimit/authLimiter.js')).default;
    validateRequest = (await import('../../middlewares/validateRequest/validateRequest.js')).validateRequest;
    documentController = (await import('./document.controller.js')).documentController;
    DocumentValidation = (await import('./document.validation.js')).DocumentValidation;

    // Import the route file to execute its setup logic
    await import('./document.route.js');
  });

  it('should create an express app and register the document drafting router', () => {
    expect(express).toHaveBeenCalled();
    expect(express.Router).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith('/api/v1/document-drafting', mockRouter);
  });

  describe('Health and Readiness Probes', () => {
    it('should register the GET /healthz liveness probe', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/healthz', expect.any(Function));
    });

    it('should register the GET /readyz readiness probe', () => {
      expect(mockApp.get).toHaveBeenCalledWith('/readyz', expect.any(Function));
    });
  });

  describe('POST /assistant', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/assistant',
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        createRateLimiter(30, 15),
        validateRequest(DocumentValidation.conversationalRequestSchema),
        documentController.conversationalAssistant
      );
    });

    it('should apply middlewares in the correct order', () => {
      const assistantRouteArgs = mockRouter.post.mock.calls.find(call => call[0] === '/assistant');
      expect(assistantRouteArgs).toBeDefined();
      expect(assistantRouteArgs[1]).toBe('optionalAuthMiddleware');
      expect(assistantRouteArgs[2]).toBe('extractTenantContextMiddleware');
      expect(assistantRouteArgs[3]).toBe('checkDailyRequestLimitMiddleware');
      expect(assistantRouteArgs[4]).toBe('rateLimiterMiddleware(30,15)');
      expect(assistantRouteArgs[5]).toBe('validateRequestMiddleware(conversationalRequestSchema)');
      expect(assistantRouteArgs[6]).toBe('conversationalAssistantController');
    });
  });

  describe('POST /generate', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/generate',
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        createRateLimiter(20, 15),
        validateRequest(DocumentValidation.generateDocumentSchema),
        documentController.generateDocument
      );
    });
  });

  describe('POST /export', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/export',
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        createRateLimiter(20, 15),
        validateRequest(DocumentValidation.exportDocumentSchema),
        documentController.exportDocument
      );
    });
  });

  describe('POST /edit', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/edit',
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        createRateLimiter(20, 15),
        validateRequest(DocumentValidation.editDocumentSchema),
        documentController.editDocument
      );
    });
  });

  describe('Role-based Access and Context Boundaries', () => {
    it('should use optionalAuth for all routes, allowing both guests and authenticated users', () => {
      // All routes use optionalAuth, not role-specific auth. This test verifies that design.
      expect(optionalAuth).toHaveBeenCalledTimes(4);
      const auth = (await import('../../middlewares/auth/auth.js')).default;
      expect(auth).not.toHaveBeenCalled(); // No role-specific auth is used
    });

    it('should use extractTenantContext for all routes to maintain context boundaries', () => {
      // This middleware is crucial for multi-tenancy.
      expect(extractTenantContext).toHaveBeenCalledTimes(4);
    });
  });
});