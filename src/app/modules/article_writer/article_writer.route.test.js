import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock Express Router
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('express', () => ({
  default: {
    Router: () => ({
      get: mockGet,
      post: mockPost,
    }),
  },
}));

// Mock Middlewares, Controllers, and Validators
const mockAuth = vi.fn((..._roles) => 'authMiddleware');
const mockOptionalAuth = vi.fn(() => 'optionalAuthMiddleware');
const mockCheckDailyRequestLimit = vi.fn(() => 'checkDailyRequestLimitMiddleware');
const mockCreateRateLimiter = vi.fn((..._args) => 'rateLimiterMiddleware');
const mockValidateRequest = vi.fn((_schema) => 'validateRequestMiddleware');
const mockUploadArticleFile = { single: vi.fn((_field) => 'uploadFileMiddleware') };
const mockExtractTenantContext = vi.fn(() => 'extractTenantContextMiddleware');
const mockCheckRAGFeature = vi.fn(() => 'checkRAGFeatureMiddleware');
const mockCheckStorageLimit = vi.fn(() => 'checkStorageLimitMiddleware');

const mockArticleWriterController = {
  conversationalAssistant: vi.fn(),
  getConversationHistory: vi.fn(),
};

const mockArticleWriterValidation = {
  conversationalRequestSchema: { name: 'conversationalRequestSchema' },
  conversationalRequestWithGcsSchema: { name: 'conversationalRequestWithGcsSchema' },
  getConversationHistorySchema: { name: 'getConversationHistorySchema' },
};

// Apply mocks to the module system
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    USER: 'USER',
    ADMIN: 'ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN',
    MANAGER: 'MANAGER',
  },
}));
vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: mockCreateRateLimiter }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.mock('./article_writer.controller.js', () => ({ articleWriterController: mockArticleWriterController }));
vi.mock('./article_writer.validation.js', () => ({ ArticleWriterValidation: mockArticleWriterValidation }));
vi.mock('./middlewares/uploadArticleFile.js', () => ({ uploadArticleFile: mockUploadArticleFile }));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));
vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({ default: mockCheckRAGFeature }));
vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({ default: mockCheckStorageLimit }));

describe('article_writer.route.js', () => {
  let ENUM_USER_ROLE;

  beforeEach(async () => {
    // Dynamically import to get the mocked enum values
    const enumModule = await import('../../../shared/enum.js');
    ENUM_USER_ROLE = enumModule.ENUM_USER_ROLE;
  });

  beforeAll(async () => {
    // Import the router file to execute its code and apply routes to the mocked router
    await import('./article_writer.route.js');
  });

  describe('POST /assistant', () => {
    it('should register the route with the correct path and method', () => {
      const assistantCall = mockPost.mock.calls.find(call => call[0] === '/assistant');
      expect(assistantCall).toBeDefined();
    });

    it('should use the correct middleware stack in the correct order', () => {
      const assistantCall = mockPost.mock.calls.find(call => call[0] === '/assistant');
      const middlewareStack = assistantCall.slice(1);

      expect(middlewareStack).toEqual([
        'optionalAuthMiddleware',
        mockExtractTenantContext,
        'rateLimiterMiddleware',
        'validateRequestMiddleware',
        mockCheckDailyRequestLimit,
        mockArticleWriterController.conversationalAssistant,
      ]);

      // Verify that middlewares with arguments were called correctly
      expect(mockOptionalAuth).toHaveBeenCalledOnce();
      expect(mockCreateRateLimiter).toHaveBeenCalledWith(30, 15);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockArticleWriterValidation.conversationalRequestWithGcsSchema);
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should register the route with the correct path and method', () => {
      expect(mockGet).toHaveBeenCalledOnce();
      expect(mockGet.mock.calls[0][0]).toBe('/conversation/:conversationId');
    });

    it('should use the correct middleware stack in the correct order', () => {
      const middlewareStack = mockGet.mock.calls[0].slice(1);

      expect(middlewareStack).toEqual([
        mockAuth(),
        mockExtractTenantContext,
        mockValidateRequest(),
        mockArticleWriterController.getConversationHistory,
      ]);

      // Verify that middlewares with arguments were called correctly
      expect(mockValidateRequest).toHaveBeenCalledWith(mockArticleWriterValidation.getConversationHistorySchema);
    });

    it('should protect the route with auth middleware for USER and ADMIN roles', () => {
      expect(mockAuth).toHaveBeenCalled();
      expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);
    });
  });
});