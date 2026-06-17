import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// --- Mock Dependencies ---

// Mock Express to spy on router and app creation/usage
const { mockRouter, mockApp, mockExpress } = vi.hoisted(() => {
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
  const mockExpress = vi.fn(() => mockApp);
  mockExpress.Router = vi.fn(() => mockRouter);
  return { mockRouter, mockApp, mockExpress };
});

vi.mock('express', () => ({
  default: mockExpress,
  Router: mockExpress.Router,
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
    // Note: Do not call vi.clearAllMocks() to preserve route registrations

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

  it('should create a router', () => {
    expect(express.Router).toHaveBeenCalled();
  });

  describe('POST /assistant', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/assistant',
        'optionalAuthMiddleware',
        extractTenantContext,
        checkDailyRequestLimit,
        'rateLimiterMiddleware(30,15)',
        'validateRequestMiddleware(conversationalRequestSchema)',
        documentController.conversationalAssistant
      );
    });

    it('should apply middlewares in the correct order', () => {
      const assistantRouteArgs = mockRouter.post.mock.calls.find(call => call[0] === '/assistant');
      expect(assistantRouteArgs).toBeDefined();
      expect(assistantRouteArgs[1]).toBe('optionalAuthMiddleware');
      expect(assistantRouteArgs[2]).toBe(extractTenantContext);
      expect(assistantRouteArgs[3]).toBe(checkDailyRequestLimit);
      expect(assistantRouteArgs[4]).toBe('rateLimiterMiddleware(30,15)');
      expect(assistantRouteArgs[5]).toBe('validateRequestMiddleware(conversationalRequestSchema)');
      expect(assistantRouteArgs[6]).toBe(documentController.conversationalAssistant);
    });
  });

  describe('POST /generate', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/generate',
        'optionalAuthMiddleware',
        extractTenantContext,
        checkDailyRequestLimit,
        'rateLimiterMiddleware(20,15)',
        'validateRequestMiddleware(generateDocumentSchema)',
        documentController.generateDocument
      );
    });
  });

  describe('POST /export', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/export',
        'optionalAuthMiddleware',
        extractTenantContext,
        checkDailyRequestLimit,
        'rateLimiterMiddleware(20,15)',
        'validateRequestMiddleware(exportDocumentSchema)',
        documentController.exportDocument
      );
    });
  });

  describe('POST /edit', () => {
    it('should be configured with optional auth, context, limits, validation, and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/edit',
        'optionalAuthMiddleware',
        extractTenantContext,
        checkDailyRequestLimit,
        'rateLimiterMiddleware(20,15)',
        'validateRequestMiddleware(editDocumentSchema)',
        documentController.editDocument
      );
    });
  });

  describe('Role-based Access and Context Boundaries', () => {
    it('should use optionalAuth for all routes, allowing both guests and authenticated users', async () => {
      // All routes use optionalAuth, not role-specific auth. This test verifies that design.
      expect(optionalAuth).toHaveBeenCalledTimes(4);
      const auth = (await import('../../middlewares/auth/auth.js')).default;
      expect(auth).not.toHaveBeenCalled(); // No role-specific auth is used
    });

    it('should use extractTenantContext for all routes to maintain context boundaries', () => {
      // This middleware is crucial for multi-tenancy.
      const assistantCall = mockRouter.post.mock.calls.find(call => call[0] === '/assistant');
      const generateCall = mockRouter.post.mock.calls.find(call => call[0] === '/generate');
      const exportCall = mockRouter.post.mock.calls.find(call => call[0] === '/export');
      const editCall = mockRouter.post.mock.calls.find(call => call[0] === '/edit');

      expect(assistantCall).toContain(extractTenantContext);
      expect(generateCall).toContain(extractTenantContext);
      expect(exportCall).toContain(extractTenantContext);
      expect(editCall).toContain(extractTenantContext);
    });
  });
});