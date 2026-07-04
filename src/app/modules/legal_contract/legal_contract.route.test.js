import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// --- Mocks ---

// Mock @google-cloud/pubsub
const mockPublishMessage = vi.fn();
const mockTopic = vi.fn().mockImplementation(() => ({
  publishMessage: mockPublishMessage,
}));

const {
  mockPubSub,
  mockAuthMiddleware,
  mockExtractTenantContext,
  mockCheckDailyRequestLimit,
  mockValidateRequest,
  mockUploadMiddleware,
  mockCheckRAGFeature,
  mockCheckStorageLimit,
  mockLegalContractController,
  mockValidationSchemas,
  mockRouter
} = vi.hoisted(() => {
  const mockPubSub = vi.fn().mockImplementation(() => ({
    topic: mockTopic,
  }));

  // Mock Middlewares
  const mockAuthMiddleware = vi.fn().mockImplementation((...roles) => (req, res, next) => next());

  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());

  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());

  const mockValidateRequest = vi.fn().mockImplementation(schema => (req, res, next) => next());

  const mockUploadMiddleware = {
    single: vi.fn().mockImplementation(() => (req, res, next) => next()),
  };

  const mockCheckRAGFeature = vi.fn().mockImplementation((req, res, next) => next());

  const mockCheckStorageLimit = vi.fn().mockImplementation((req, res, next) => next());

  // Mock Controller and Validation
  const mockLegalContractController = {
    getConversationHistory: vi.fn(),
    downloadContract: vi.fn(),
  };

  const mockValidationSchemas = {
    conversationalRequestSchema: { name: 'conversationalRequestSchema' },
    generateContractSchema: { name: 'generateContractSchema' },
    getConversationHistorySchema: { name: 'getConversationHistorySchema' },
    downloadContractSchema: { name: 'downloadContractSchema' },
    modifyContractSchema: { name: 'modifyContractSchema' },
  };

  // Mock express.Router
  const mockRouter = {
    post: vi.fn(),
    get: vi.fn(),
  };

  return {
    mockPubSub,
    mockAuthMiddleware,
    mockExtractTenantContext,
    mockCheckDailyRequestLimit,
    mockValidateRequest,
    mockUploadMiddleware,
    mockCheckRAGFeature,
    mockCheckStorageLimit,
    mockLegalContractController,
    mockValidationSchemas,
    mockRouter
  };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: mockPubSub,
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockImplementation(() => 'mock-uuid-v4'),
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuthMiddleware,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: mockValidateRequest,
}));

vi.mock('./middlewares/uploadLegalContract.js', () => ({
  uploadLegalContract: mockUploadMiddleware,
}));

vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: mockCheckRAGFeature,
}));

vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: mockCheckStorageLimit,
}));

vi.mock('./legal_contract.controller.js', () => ({
  legalContractController: mockLegalContractController,
}));

vi.mock('./legal_contract.validation.js', () => ({
  LegalContractValidation: mockValidationSchemas,
}));

vi.mock('express', {
  default: {
    Router: () => mockRouter,
  },
});

// --- Test Suite ---

// Import the router file to trigger its execution against the mocks
await import('./legal_contract.route.js');

describe('legal_contract.route.js', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      body: {},
      user: { id: 'user-123', role: 'user' },
      tenantId: 'tenant-abc',
      file: null,
      params: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('POST /assistant', () => {
    const routeArgs = mockRouter.post.mock.calls.find(call => call[0] === '/assistant');
    const handler = routeArgs[routeArgs.length - 1];

    it('should register the route with correct middlewares and role access', () => {
      expect(routeArgs).toBeDefined();
      expect(mockAuthMiddleware).toHaveBeenCalledWith(
        ENUM_USER_ROLE.USER,
        ENUM_USER_ROLE.MANAGER,
        ENUM_USER_ROLE.ADMIN
      );
      expect(mockUploadMiddleware.single).toHaveBeenCalledWith('file');
      expect(mockValidateRequest).toHaveBeenCalledWith(
        mockValidationSchemas.conversationalRequestSchema
      );
      // Check middleware order implicitly by their factory calls
      expect(mockAuthMiddleware).toHaveBeenCalledBefore(mockExtractTenantContext);
      expect(mockExtractTenantContext).toHaveBeenCalledBefore(mockCheckDailyRequestLimit);
      expect(mockCheckDailyRequestLimit).toHaveBeenCalledBefore(mockCheckStorageLimit);
      expect(mockCheckStorageLimit).toHaveBeenCalledBefore(mockUploadMiddleware.single);
      expect(mockUploadMiddleware.single).toHaveBeenCalledBefore(mockCheckRAGFeature);
      expect(mockCheckRAGFeature).toHaveBeenCalledBefore(mockValidateRequest);
    });

    it('should queue a job with a new conversationId when one is not provided', async () => {
      mockReq.body = { prompt: 'Analyze this contract' };
      await handler(mockReq, mockRes, mockNext);

      expect(mockTopic).toHaveBeenCalledWith('projects/your-gcp-project-id/topics/conversational-assistant-jobs');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          prompt: 'Analyze this contract',
          conversationId: 'mock-uuid-v4',
          user: mockReq.user,
          tenantId: mockReq.tenantId,
          file: null,
        },
      });
      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        statusCode: 202,
        message: 'Your request is being processed. You will be notified upon completion.',
        data: { conversationId: 'mock-uuid-v4' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should queue a job with an existing conversationId and file info', async () => {
      mockReq.body = { prompt: 'Continue analysis', conversationId: 'existing-conv-id' };
      mockReq.file = {
        path: 'gcs/path/to/file.pdf',
        originalname: 'contract.pdf',
        mimetype: 'application/pdf',
        size: 12345,
      };
      await handler(mockReq, mockRes, mockNext);

      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          prompt: 'Continue analysis',
          conversationId: 'existing-conv-id',
          user: mockReq.user,
          tenantId: mockReq.tenantId,
          file: {
            path: 'gcs/path/to/file.pdf',
            originalname: 'contract.pdf',
            mimetype: 'application/pdf',
            size: 12345,
          },
        },
      });
      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { conversationId: 'existing-conv-id' },
        })
      );
    });

    it('should call next with an error if pub/sub fails', async () => {
      const error = new Error('Pub/Sub publish failed');
      mockPublishMessage.mockRejectedValue(error);
      await handler(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('POST /generate', () => {
    const routeArgs = mockRouter.post.mock.calls.find(call => call[0] === '/generate');
    const handler = routeArgs[routeArgs.length - 1];

    it('should register the route with correct middlewares and role access', () => {
      expect(routeArgs).toBeDefined();
      expect(mockAuthMiddleware).toHaveBeenCalledWith(
        ENUM_USER_ROLE.USER,
        ENUM_USER_ROLE.MANAGER,
        ENUM_USER_ROLE.ADMIN
      );
      expect(mockValidateRequest).toHaveBeenCalledWith(
        mockValidationSchemas.generateContractSchema
      );
    });

    it('should queue a contract generation job', async () => {
      mockReq.body = { templateId: 'nda-template', variables: { name: 'Alti Assistant' } };
      await handler(mockReq, mockRes, mockNext);

      expect(mockTopic).toHaveBeenCalledWith('projects/your-gcp-project-id/topics/generate-contract-jobs');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          jobId: 'mock-uuid-v4',
          templateId: 'nda-template',
          variables: { name: 'Alti Assistant' },
          user: mockReq.user,
          tenantId: mockReq.tenantId,
        },
      });
      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        statusCode: 202,
        message: 'Contract generation has started. You can check the status using the provided jobId.',
        data: { jobId: 'mock-uuid-v4' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('POST /modify', () => {
    const routeArgs = mockRouter.post.mock.calls.find(call => call[0] === '/modify');
    const handler = routeArgs[routeArgs.length - 1];

    it('should register the route with correct middlewares and role access', () => {
      expect(routeArgs).toBeDefined();
      expect(mockAuthMiddleware).toHaveBeenCalledWith(
        ENUM_USER_ROLE.USER,
        ENUM_USER_ROLE.MANAGER,
        ENUM_USER_ROLE.ADMIN
      );
      expect(mockValidateRequest).toHaveBeenCalledWith(
        mockValidationSchemas.modifyContractSchema
      );
    });

    it('should queue a contract modification job', async () => {
      mockReq.body = { conversationId: 'conv-to-modify', instruction: 'Change the effective date' };
      await handler(mockReq, mockRes, mockNext);

      expect(mockTopic).toHaveBeenCalledWith('projects/your-gcp-project-id/topics/modify-contract-jobs');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          conversationId: 'conv-to-modify',
          instruction: 'Change the effective date',
          user: mockReq.user,
          tenantId: mockReq.tenantId,
        },
      });
      expect(mockRes.status).toHaveBeenCalledWith(202);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        statusCode: 202,
        message: 'Contract modification request received and is being processed.',
        data: { conversationId: 'conv-to-modify' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('GET /conversation/:conversationId', () => {
    const routeArgs = mockRouter.get.mock.calls.find(call => call[0] === '/conversation/:conversationId');
    const handler = routeArgs[routeArgs.length - 1];

    it('should register the route with correct middlewares and role access', () => {
      expect(routeArgs).toBeDefined();
      expect(mockAuthMiddleware).toHaveBeenCalledWith(
        ENUM_USER_ROLE.USER,
        ENUM_USER_ROLE.MANAGER,
        ENUM_USER_ROLE.ADMIN
      );
      expect(mockValidateRequest).toHaveBeenCalledWith(
        mockValidationSchemas.getConversationHistorySchema
      );
    });

    it('should call the correct controller method', () => {
      expect(handler).toBe(mockLegalContractController.getConversationHistory);
    });
  });

  describe('GET /download/:conversationId', () => {
    const routeArgs = mockRouter.get.mock.calls.find(call => call[0] === '/download/:conversationId');
    const handler = routeArgs[routeArgs.length - 1];

    it('should register the route with correct middlewares and role access', () => {
      expect(routeArgs).toBeDefined();
      expect(mockAuthMiddleware).toHaveBeenCalledWith(
        ENUM_USER_ROLE.USER,
        ENUM_USER_ROLE.MANAGER,
        ENUM_USER_ROLE.ADMIN
      );
      expect(mockValidateRequest).toHaveBeenCalledWith(
        mockValidationSchemas.downloadContractSchema
      );
    });

    it('should call the correct controller method', () => {
      expect(handler).toBe(mockLegalContractController.downloadContract);
    });
  });
});