import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { documentReviewController } from './document_review.controller.js';
import { DocumentReviewValidation } from './document_review.validation.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// --- Pre-test Setup ---

// Set environment variables required by the module
process.env.GCS_DOCUMENT_BUCKET = 'test-bucket';
process.env.MAX_DOCUMENT_UPLOAD_SIZE_MB = '10';

// Mock Express Router
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock shared enums
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    USER: 'user',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin',
    MANAGER: 'manager',
  },
}));

// Mock all middlewares to isolate the router logic
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn((...roles) => `authMiddleware(${roles.join(',')})`),
}));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => 'optionalAuthMiddleware'),
}));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: 'extractTenantContextMiddleware',
}));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: 'checkDailyRequestLimitMiddleware',
}));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: vi.fn((...args) => `rateLimiterMiddleware(${args.join(',')})`),
}));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: vi.fn(schema => `validateRequestMiddleware(${schema})`),
}));
vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: 'checkRAGFeatureMiddleware',
}));
vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: 'checkStorageLimitMiddleware',
}));

// Mock controller and validation schemas
vi.mock('./document_review.controller.js', () => ({
  documentReviewController: {
    conversationalAssistant: 'conversationalAssistantController',
    reviewDocument: 'reviewDocumentController',
    getConversationHistory: 'getConversationHistoryController',
  },
}));
vi.mock('./document_review.validation.js', () => ({
  DocumentReviewValidation: {
    conversationalRequestSchema: 'conversationalRequestSchema',
    reviewDocumentSchema: 'reviewDocumentSchema',
    getConversationHistorySchema: 'getConversationHistorySchema',
  },
}));

// Mock GCS and upload-related dependencies
vi.mock('@google-cloud/storage', () => {
  const mockStorage = {
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        createWriteStream: vi.fn(() => ({
          on: vi.fn().mockReturnThis(),
          pipe: vi.fn().mockReturnThis(),
        })),
      })),
      name: 'mock-gcs-bucket',
    })),
  };
  return { Storage: vi.fn(() => mockStorage) };
});
vi.mock('busboy', () => ({ default: vi.fn(() => ({ on: vi.fn() })) }));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid-v4') }));
vi.mock('path', () => ({ default: { extname: vi.fn(f => `.${f.split('.').pop()}`) } }));

// Import the router file. This will execute the route definitions against the mocked router.
import { documentReviewRoutes } from './document_review.route.js';

describe('Document Review Routes', () => {
  beforeEach(() => {
    // Clear mock history before each test to ensure isolation
    vi.clearAllMocks();
  });

  // This test is redundant because the module import itself is the action,
  // but it's a good sanity check to ensure the mocks are working.
  it('should initialize the router and define routes upon module import', () => {
    // Re-import to trigger setup again after mocks are cleared for this specific test
    // Note: This is generally not needed if you trust the test runner's module caching,
    // but can be useful for explicit re-evaluation. Here, we'll rely on the initial import.
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(documentReviewRoutes).toBe(mockRouter);
    expect(mockRouter.post).toHaveBeenCalled();
    expect(mockRouter.get).toHaveBeenCalled();
  });

  describe('POST /assistant', () => {
    it('should configure the route with the correct path and middleware chain', () => {
      const routeCall = mockRouter.post.mock.calls.find(call => call[0] === '/assistant');
      expect(routeCall).toBeDefined();

      const middlewareChain = routeCall.slice(1);

      expect(middlewareChain).toEqual([
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        expect.any(Function), // streamUploadToGCS('file')
        checkStorageLimit,
        checkRAGFeature,
        createRateLimiter(30, 15),
        validateRequest(DocumentReviewValidation.conversationalRequestSchema),
        documentReviewController.conversationalAssistant,
      ]);

      expect(middlewareChain.length).toBe(9);
      expect(optionalAuth).toHaveBeenCalled();
      expect(createRateLimiter).toHaveBeenCalledWith(30, 15);
      expect(validateRequest).toHaveBeenCalledWith(DocumentReviewValidation.conversationalRequestSchema);
    });
  });

  describe('POST /review', () => {
    it('should configure the route with the correct path and middleware chain', () => {
      const routeCall = mockRouter.post.mock.calls.find(call => call[0] === '/review');
      expect(routeCall).toBeDefined();

      const middlewareChain = routeCall.slice(1);

      expect(middlewareChain).toEqual([
        optionalAuth(),
        extractTenantContext,
        checkDailyRequestLimit,
        expect.any(Function), // streamUploadToGCS('file')
        checkStorageLimit,
        checkRAGFeature,
        createRateLimiter(20, 15),
        validateRequest(DocumentReviewValidation.reviewDocumentSchema),
        documentReviewController.reviewDocument,
      ]);

      expect(middlewareChain.length).toBe(9);
      expect(createRateLimiter).toHaveBeenCalledWith(20, 15);
      expect(validateRequest).toHaveBeenCalledWith(DocumentReviewValidation.reviewDocumentSchema);
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should configure the route with role-based auth and correct middleware chain', () => {
      const routeCall = mockRouter.get.mock.calls.find(call => call[0] === '/conversation/:conversationId');
      expect(routeCall).toBeDefined();

      // Check that the auth middleware was called with the correct roles
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);

      const middlewareChain = routeCall.slice(1);

      expect(middlewareChain).toEqual([
        auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
        extractTenantContext,
        validateRequest(DocumentReviewValidation.getConversationHistorySchema),
        documentReviewController.getConversationHistory,
      ]);

      expect(middlewareChain.length).toBe(4);
      expect(validateRequest).toHaveBeenCalledWith(DocumentReviewValidation.getConversationHistorySchema);
    });
  });
});