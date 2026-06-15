import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import router from './presentation.route.js';
import { presentationController } from './presentation.controller.js';
import { PresentationValidation } from './presentation.validation.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';

const {
  mockRouterInstance
} = vi.hoisted(() => {
  // Mock dependencies
  const mockRouterInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  return {
    mockRouterInstance
  };
});
vi.mock('express', () => ({
  default: {
    Router: () => mockRouterInstance,
  },
}));

vi.mock('./presentation.controller.js', () => ({
  presentationController: {
    conversationalAssistant: vi.fn(),
    generatePresentation: vi.fn(),
    checkTaskStatus: vi.fn(),
    editPresentation: vi.fn(),
    derivePresentation: vi.fn(),
    getPresentation: vi.fn(),
  },
}));

vi.mock('./presentation.validation.js', () => ({
  PresentationValidation: {
    conversationalRequestSchema: { _id: 'conversationalRequestSchema' },
    generatePresentationSchema: { _id: 'generatePresentationSchema' },
    checkStatusSchema: { _id: 'checkStatusSchema' },
    editPresentationSchema: { _id: 'editPresentationSchema' },
    getPresentationSchema: { _id: 'getPresentationSchema' },
  },
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn().mockImplementation(() => (req, res, next) => next()),
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: vi.fn().mockImplementation((req, res, next) => next()),
}));

vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: vi.fn().mockImplementation(() => (req, res, next) => next()),
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: vi.fn().mockImplementation(() => (req, res, next) => next()),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: vi.fn().mockImplementation((req, res, next) => next()),
}));

describe('Presentation Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-import the router module to re-evaluate and re-apply routes to the fresh mock
    // This ensures each test is isolated.
    // Note: This dynamic import approach is one way to handle re-evaluation in Vitest.
    // Depending on project setup, you might not need it if mocks are cleared correctly.
    // For this test, we'll check the calls made during the initial static import.
  });

  // The router file is imported once, so we test the state of the mock after that import.
  // The router instance from the static import is `router`.
  const importedRouter = router;

  it('should be an instance of Express Router', () => {
    expect(importedRouter).toBe(mockRouterInstance);
  });

  describe('POST /assistant', () => {
    it('should define the route with correct middlewares and controller', () => {
      expect(mockRouterInstance.post).toHaveBeenCalledWith(
        '/assistant',
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        createRateLimiter(20, 15),
        validateRequest(PresentationValidation.conversationalRequestSchema),
        presentationController.conversationalAssistant
      );
    });

    it('should configure middlewares correctly', () => {
      // These checks verify the factories are called with the right arguments
      expect(optionalAuth).toHaveBeenCalledWith();
      expect(createRateLimiter).toHaveBeenCalledWith(20, 15);
      expect(validateRequest).toHaveBeenCalledWith(PresentationValidation.conversationalRequestSchema);
    });
  });

  describe('POST /generate', () => {
    it('should define the route with correct middlewares and controller', () => {
      expect(mockRouterInstance.post).toHaveBeenCalledWith(
        '/generate',
        optionalAuth(),
        extractTenantContext,
        createRateLimiter(10, 15),
        validateRequest(PresentationValidation.generatePresentationSchema),
        presentationController.generatePresentation
      );
    });

    it('should configure middlewares correctly', () => {
      expect(optionalAuth).toHaveBeenCalledWith();
      expect(createRateLimiter).toHaveBeenCalledWith(10, 15);
      expect(validateRequest).toHaveBeenCalledWith(PresentationValidation.generatePresentationSchema);
    });
  });

  describe('GET /status/:taskId', () => {
    it('should define the route with correct middlewares and controller', () => {
      expect(mockRouterInstance.get).toHaveBeenCalledWith(
        '/status/:taskId',
        optionalAuth(),
        extractTenantContext,
        createRateLimiter(60, 1),
        validateRequest(PresentationValidation.checkStatusSchema),
        presentationController.checkTaskStatus
      );
    });

    it('should configure middlewares correctly', () => {
      expect(optionalAuth).toHaveBeenCalledWith();
      expect(createRateLimiter).toHaveBeenCalledWith(60, 1);
      expect(validateRequest).toHaveBeenCalledWith(PresentationValidation.checkStatusSchema);
    });
  });

  describe('POST /edit', () => {
    it('should define the route with correct middlewares and controller', () => {
      expect(mockRouterInstance.post).toHaveBeenCalledWith(
        '/edit',
        optionalAuth(),
        extractTenantContext,
        createRateLimiter(15, 15),
        validateRequest(PresentationValidation.editPresentationSchema),
        presentationController.editPresentation
      );
    });

    it('should configure middlewares correctly', () => {
      expect(optionalAuth).toHaveBeenCalledWith();
      expect(createRateLimiter).toHaveBeenCalledWith(15, 15);
      expect(validateRequest).toHaveBeenCalledWith(PresentationValidation.editPresentationSchema);
    });
  });

  describe('POST /derive', () => {
    it('should define the route with correct middlewares and controller', () => {
      expect(mockRouterInstance.post).toHaveBeenCalledWith(
        '/derive',
        optionalAuth(),
        extractTenantContext,
        createRateLimiter(15, 15),
        validateRequest(PresentationValidation.editPresentationSchema),
        presentationController.derivePresentation
      );
    });

    it('should configure middlewares correctly', () => {
      expect(optionalAuth).toHaveBeenCalledWith();
      expect(createRateLimiter).toHaveBeenCalledWith(15, 15);
      expect(validateRequest).toHaveBeenCalledWith(PresentationValidation.editPresentationSchema);
    });
  });

  describe('GET /:presentationId', () => {
    it('should define the route with correct middlewares and controller', () => {
      expect(mockRouterInstance.get).toHaveBeenCalledWith(
        '/:presentationId',
        optionalAuth(),
        extractTenantContext,
        createRateLimiter(60, 5),
        validateRequest(PresentationValidation.getPresentationSchema),
        presentationController.getPresentation
      );
    });

    it('should configure middlewares correctly', () => {
      expect(optionalAuth).toHaveBeenCalledWith();
      expect(createRateLimiter).toHaveBeenCalledWith(60, 5);
      expect(validateRequest).toHaveBeenCalledWith(PresentationValidation.getPresentationSchema);
    });
  });
});