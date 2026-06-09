import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock all external dependencies
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    USER: 'user',
    ADMIN: 'admin',
  },
}));

// Mock middleware functions
const mockAuth = vi.fn((...roles) => (req, res, next) => {
  req.user = { id: 'testUserId', role: roles[0] || 'user', tenantId: 'testTenantId' }; // Simulate authenticated user
  next();
});
const mockOptionalAuth = vi.fn(() => (req, res, next) => {
  // Simulate optional auth, sometimes setting req.user, sometimes not
  // For tests, we'll control this via specific test cases
  next();
});
const mockExtractTenantContext = vi.fn((req, res, next) => {
  req.tenant = { id: 'testTenantId', name: 'Test Tenant' };
  next();
});
const mockCheckDailyRequestLimit = vi.fn((req, res, next) => next());
const mockCheckStorageLimit = vi.fn((req, res, next) => next());
const mockUploadLegalContractReview = {
  single: vi.fn(() => (req, res, next) => {
    req.file = { originalname: 'test.pdf', buffer: Buffer.from('test content') };
    next();
  }),
};
const mockCheckRAGFeature = vi.fn((req, res, next) => next());
const mockValidateRequest = vi.fn((schema) => (req, res, next) => {
  // Simulate successful validation
  next();
});

// Mock controller functions
const mockLegalContractReviewController = {
  conversationalAssistant: vi.fn((req, res) => res.status(200).json({ success: true, message: 'Assistant response' })),
  reviewContract: vi.fn((req, res) => res.status(200).json({ success: true, message: 'Review response' })),
  getConversationHistory: vi.fn((req, res) => res.status(200).json({ success: true, message: 'History response' })),
};

// Mock validation schemas (they just need to exist for validateRequest to be called)
const mockLegalContractReviewValidation = {
  conversationalRequestSchema: {},
  reviewContractSchema: {},
  getConversationHistorySchema: {},
};

// Re-import the module after mocks are set up
vi.doMock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));
vi.doMock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));
vi.doMock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));
vi.doMock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.doMock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({ default: mockCheckStorageLimit }));
vi.doMock('./middlewares/uploadLegalContractReview.js', () => ({ uploadLegalContractReview: mockUploadLegalContractReview }));
vi.doMock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({ default: mockCheckRAGFeature }));
vi.doMock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.doMock('./legal_contract_review.controller.js', () => ({ legalContractReviewController: mockLegalContractReviewController }));
vi.doMock('./legal_contract_review.validation.js', () => ({ LegalContractReviewValidation: mockLegalContractReviewValidation }));

// Import the router after all mocks are defined
const { legalContractReviewRoutes } = await import('./legal_contract_review.route.js');

describe('legalContractReviewRoutes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json()); // For parsing application/json
    app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
    app.use('/api/v1/legal-contract-review', legalContractReviewRoutes);

    // Reset all mocks before each test
    vi.clearAllMocks();

    // Ensure optionalAuth and auth mocks behave as expected for each test
    mockOptionalAuth.mockImplementation(() => (req, res, next) => next());
    mockAuth.mockImplementation((...roles) => (req, res, next) => {
      req.user = { id: 'testUserId', role: roles[0] || 'user', tenantId: 'testTenantId' };
      next();
    });
  });

  // Helper to simulate a request with specific user/auth state
  const simulateRequest = async (method, path, body = {}, user = null) => {
    const req = { body, user, tenant: { id: 'testTenantId' } };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    // Manually call the custom middleware
    const { requireAuthForConversationId } = await import('./legal_contract_review.route.js');
    await requireAuthForConversationId(req, res, next);

    return { req, res, next };
  };

  describe('POST /assistant', () => {
    it('should call conversationalAssistant controller with correct middleware chain for new conversation (guest)', async () => {
      await request(app)
        .post('/api/v1/legal-contract-review/assistant')
        .field('message', 'Hello AI')
        .expect(200);

      expect(mockOptionalAuth).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockCheckDailyRequestLimit).toHaveBeenCalled();
      expect(mockCheckStorageLimit).toHaveBeenCalled();
      expect(mockUploadLegalContractReview.single).toHaveBeenCalledWith('file');
      expect(mockCheckRAGFeature).toHaveBeenCalled();
      expect(mockValidateRequest).toHaveBeenCalledWith(mockLegalContractReviewValidation.conversationalRequestSchema);
      expect(mockLegalContractReviewController.conversationalAssistant).toHaveBeenCalled();
    });

    it('should call conversationalAssistant controller with correct middleware chain for new conversation (authenticated)', async () => {
      mockOptionalAuth.mockImplementationOnce(() => (req, res, next) => {
        req.user = { id: 'authUserId', role: 'user', tenantId: 'testTenantId' };
        next();
      });

      await request(app)
        .post('/api/v1/legal-contract-review/assistant')
        .field('message', 'Hello AI')
        .expect(200);

      expect(mockOptionalAuth).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockCheckDailyRequestLimit).toHaveBeenCalled();
      expect(mockCheckStorageLimit).toHaveBeenCalled();
      expect(mockUploadLegalContractReview.single).toHaveBeenCalledWith('file');
      expect(mockCheckRAGFeature).toHaveBeenCalled();
      expect(mockValidateRequest).toHaveBeenCalledWith(mockLegalContractReviewValidation.conversationalRequestSchema);
      expect(mockLegalContractReviewController.conversationalAssistant).toHaveBeenCalled();
    });

    it('should allow authenticated user to continue an existing conversation', async () => {
      mockOptionalAuth.mockImplementationOnce(() => (req, res, next) => {
        req.user = { id: 'authUserId', role: 'user', tenantId: 'testTenantId' };
        next();
      });

      await request(app)
        .post('/api/v1/legal-contract-review/assistant')
        .field('message', 'Continue conversation')
        .field('conversationId', 'some-uuid-123')
        .expect(200);

      expect(mockOptionalAuth).toHaveBeenCalled();
      expect(mockLegalContractReviewController.conversationalAssistant).toHaveBeenCalled();
    });

    it('should return 401 if unauthenticated user tries to continue an existing conversation', async () => {
      // Ensure optionalAuth does NOT set req.user
      mockOptionalAuth.mockImplementationOnce(() => (req, res, next) => {
        req.user = undefined; // Explicitly ensure no user
        next();
      });

      const response = await request(app)
        .post('/api/v1/legal-contract-review/assistant')
        .field('message', 'Continue conversation')
        .field('conversationId', 'some-uuid-123')
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Authentication required to continue an existing conversation.',
      });
      expect(mockLegalContractReviewController.conversationalAssistant).not.toHaveBeenCalled();
    });

    it('should handle file upload correctly', async () => {
      await request(app)
        .post('/api/v1/legal-contract-review/assistant')
        .attach('file', Buffer.from('file content'), 'test.pdf')
        .field('message', 'Analyze this file')
        .expect(200);

      expect(mockUploadLegalContractReview.single).toHaveBeenCalledWith('file');
      expect(mockLegalContractReviewController.conversationalAssistant).toHaveBeenCalled();
    });
  });

  describe('POST /review', () => {
    it('should call reviewContract controller with correct middleware chain', async () => {
      await request(app)
        .post('/api/v1/legal-contract-review/review')
        .field('reviewType', 'summary')
        .field('contractText', 'This is a contract.')
        .expect(200);

      expect(mockOptionalAuth).toHaveBeenCalled();
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockCheckDailyRequestLimit).toHaveBeenCalled();
      expect(mockCheckStorageLimit).toHaveBeenCalled();
      expect(mockUploadLegalContractReview.single).toHaveBeenCalledWith('file');
      expect(mockCheckRAGFeature).toHaveBeenCalled();
      expect(mockValidateRequest).toHaveBeenCalledWith(mockLegalContractReviewValidation.reviewContractSchema);
      expect(mockLegalContractReviewController.reviewContract).toHaveBeenCalled();
    });

    it('should handle file upload for review correctly', async () => {
      await request(app)
        .post('/api/v1/legal-contract-review/review')
        .attach('file', Buffer.from('file content'), 'contract.docx')
        .field('reviewType', 'risk_assessment')
        .expect(200);

      expect(mockUploadLegalContractReview.single).toHaveBeenCalledWith('file');
      expect(mockLegalContractReviewController.reviewContract).toHaveBeenCalled();
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should call getConversationHistory controller with correct middleware chain for authenticated user', async () => {
      await request(app)
        .get('/api/v1/legal-contract-review/conversation/some-uuid-456')
        .expect(200);

      expect(mockAuth).toHaveBeenCalledWith('user', 'admin');
      expect(mockExtractTenantContext).toHaveBeenCalled();
      expect(mockValidateRequest).toHaveBeenCalledWith(mockLegalContractReviewValidation.getConversationHistorySchema);
      expect(mockLegalContractReviewController.getConversationHistory).toHaveBeenCalled();
    });

    it('should return 401 if unauthenticated user tries to access conversation history', async () => {
      // Override mockAuth to simulate unauthenticated access
      mockAuth.mockImplementationOnce(() => (req, res, next) => {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      });

      const response = await request(app)
        .get('/api/v1/legal-contract-review/conversation/some-uuid-456')
        .expect(401);

      expect(response.body).toEqual({ success: false, message: 'Unauthorized' });
      expect(mockLegalContractReviewController.getConversationHistory).not.toHaveBeenCalled();
    });
  });
});