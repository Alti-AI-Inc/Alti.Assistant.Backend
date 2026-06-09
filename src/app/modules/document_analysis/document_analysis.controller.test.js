import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { documentAnalysisController } from './document_analysis.controller.js';

// Mock dependencies
// Mock catchAsync to simply return the async function it wraps, allowing direct testing of the controller logic.
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
}));

// Mock logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Mock sendResponse
const mockSendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

// Mock documentAnalysisService
const mockDocumentAnalysisService = {
  generateGuestUserId: vi.fn(),
  analyzeContent: vi.fn(),
  getConversationHistory: vi.fn(),
};
vi.mock('./document_analysis.service.js', () => ({
  documentAnalysisService: mockDocumentAnalysisService,
}));

// Mock SubscriptionModel
const mockSubscriptionModel = {
  findOne: vi.fn().mockReturnThis(), // Allows chaining .sort()
  sort: vi.fn(), // Mock .sort()
};
vi.mock('../payment/payment.model.js', () => ({
  default: mockSubscriptionModel,
}));

// Mock conversationHelpers
const mockConversationHelpers = {
  getConversationById: vi.fn(),
};
vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: mockConversationHelpers,
}));

// Mock RESPONSE_MESSAGES constant
const mockResponseMessages = {
  SUCCESS: 'Document analysis successful',
};
vi.mock('./document_analysis.constant.js', () => ({
  RESPONSE_MESSAGES: mockResponseMessages,
}));

describe('documentAnalysisController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    req = {
      body: {},
      params: {},
      file: undefined,
      user: undefined,
      isGuest: undefined,
    };
    res = {}; // The 'res' object is passed to sendResponse, but its methods are not directly called in the controller logic being tested.
  });

  describe('analyzeDocument', () => {
    it('should handle guest user analysis without file and send success response', async () => {
      req.isGuest = true;
      req.body = {
        message: 'Analyze this text.',
        analysisType: 'summary',
        outputFormat: 'text',
      };
      const guestUserId = 'guest-123';
      const analysisResult = { summary: 'This is a summary.' };

      mockDocumentAnalysisService.generateGuestUserId.mockReturnValue(guestUserId);
      mockDocumentAnalysisService.analyzeContent.mockResolvedValue(analysisResult);

      await documentAnalysisController.analyzeDocument(req, res);

      expect(mockDocumentAnalysisService.generateGuestUserId).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Document analysis request from guest user ${guestUserId}`,
        expect.objectContaining({
          hasFile: false,
          hasMessage: true,
          conversationId: undefined,
          analysisType: 'summary',
        })
      );
      expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled(); // No subscription check for guests
      expect(mockConversationHelpers.getConversationById).not.toHaveBeenCalled();

      expect(mockDocumentAnalysisService.analyzeContent).toHaveBeenCalledWith(
        guestUserId,
        req.body.message,
        null, // No file
        undefined, // No conversationId
        req.body.analysisType,
        req.body.outputFormat,
        true, // isGuest
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: mockResponseMessages.SUCCESS,
        data: analysisResult,
      });
    });

    it('should handle authenticated user analysis with file and conversationId and send success response', async () => {
      const userId = 'user-456';
      req.user = { userId };
      req.isGuest = false;
      req.body = {
        message: 'Analyze this document.',
        conversationId: 'conv-789',
        analysisType: 'extract',
        outputFormat: 'json',
      };
      req.file = {
        filename: 'test.pdf',
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/uploads/test.pdf',
        location: 's3://bucket/test.pdf',
      };

      const userSubscription = { userId, usage: 10 }; // Usage limit is 10
      const totalConversationWithConvId = 2; // Current usage is 2, so 2 < 10 (within limit)
      const analysisResult = { extractedData: { key: 'value' } };

      mockSubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockResolvedValue(userSubscription),
      });
      mockConversationHelpers.getConversationById.mockResolvedValue(totalConversationWithConvId);
      mockDocumentAnalysisService.analyzeContent.mockResolvedValue(analysisResult);

      await documentAnalysisController.analyzeDocument(req, res);

      expect(mockDocumentAnalysisService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Document analysis request from authenticated user ${userId}`,
        expect.objectContaining({
          hasFile: true,
          hasMessage: true,
          conversationId: 'conv-789',
          analysisType: 'extract',
        })
      );

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId });
      expect(mockSubscriptionModel.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        req.body.conversationId,
        userId,
        req
      );

      const expectedFileInfo = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        location: req.file.location,
      };

      expect(mockDocumentAnalysisService.analyzeContent).toHaveBeenCalledWith(
        userId,
        req.body.message,
        expectedFileInfo,
        req.body.conversationId,
        req.body.analysisType,
        req.body.outputFormat,
        false, // isGuest
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: mockResponseMessages.SUCCESS,
        data: analysisResult,
      });
    });

    it('should return FORBIDDEN if authenticated user exceeds subscription limit', async () => {
      const userId = 'user-456';
      req.user = { userId };
      req.isGuest = false;
      req.body = {
        message: 'Analyze this document.',
        conversationId: 'conv-789',
        analysisType: 'extract',
        outputFormat: 'json',
      };

      const userSubscription = { userId, usage: 5 }; // Usage limit is 5
      const totalConversationWithConvId = 5; // Current usage is 5, so 5 <= 5 is true (limit exceeded)

      mockSubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockResolvedValue(userSubscription),
      });
      mockConversationHelpers.getConversationById.mockResolvedValue(totalConversationWithConvId);

      await documentAnalysisController.analyzeDocument(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        req.body.conversationId,
        userId,
        req
      );
      expect(mockDocumentAnalysisService.analyzeContent).not.toHaveBeenCalled(); // Should not proceed to analysis
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Usage limit exceeded. Please upgrade your subscription.',
      });
    });

    it('should return FORBIDDEN if authenticated user has no subscription and tries to analyze', async () => {
      const userId = 'user-456';
      req.user = { userId };
      req.isGuest = false;
      req.body = {
        message: 'Analyze this document.',
        conversationId: 'conv-789',
        analysisType: 'extract',
        outputFormat: 'json',
      };

      // No subscription found
      mockSubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockResolvedValue(null),
      });
      // Even if conversation count is 0, promptUsage (0) <= totalConversationWithConvId (0) is true, triggering the limit
      mockConversationHelpers.getConversationById.mockResolvedValue(0);

      await documentAnalysisController.analyzeDocument(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        req.body.conversationId,
        userId,
        req
      );
      expect(mockDocumentAnalysisService.analyzeContent).not.toHaveBeenCalled(); // Should not proceed to analysis
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Usage limit exceeded. Please upgrade your subscription.',
      });
    });

    it('should use userId from req.body if provided, overriding req.user', async () => {
      const userIdFromUser = 'user-from-token';
      const userIdFromBody = 'user-from-body';
      req.user = { userId: userIdFromUser };
      req.isGuest = false;
      req.body = {
        userId: userIdFromBody, // This should take precedence
        message: 'Test message',
        analysisType: 'summary',
      };

      const userSubscription = { userId: userIdFromBody, usage: 10 };
      mockSubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockResolvedValue(userSubscription),
      });
      mockConversationHelpers.getConversationById.mockResolvedValue(0);
      mockDocumentAnalysisService.analyzeContent.mockResolvedValue({});

      await documentAnalysisController.analyzeDocument(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: userIdFromBody });
      expect(mockDocumentAnalysisService.analyzeContent).toHaveBeenCalledWith(
        userIdFromBody, // Assert that userIdFromBody was used
        req.body.message,
        null,
        undefined,
        req.body.analysisType,
        undefined,
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, expect.any(Object));
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history for an authenticated user and send success response', async () => {
      const conversationId = 'conv-123';
      const userId = 'user-456';
      req.params.conversationId = conversationId;
      req.user = { userId };

      const mockConversation = [
        { id: 'msg1', text: 'Hello' },
        { id: 'msg2', text: 'Hi there' },
      ];
      mockDocumentAnalysisService.getConversationHistory.mockResolvedValue(mockConversation);

      await documentAnalysisController.getConversationHistory(req, res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        `Fetching conversation history: ${conversationId} for user ${userId}`
      );
      expect(mockDocumentAnalysisService.getConversationHistory).toHaveBeenCalledWith(
        conversationId,
        userId,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: mockConversation,
      });
    });

    it('should handle no conversation found gracefully', async () => {
      const conversationId = 'conv-123';
      const userId = 'user-456';
      req.params.conversationId = conversationId;
      req.user = { userId };

      mockDocumentAnalysisService.getConversationHistory.mockResolvedValue(null);

      await documentAnalysisController.getConversationHistory(req, res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        `Fetching conversation history: ${conversationId} for user ${userId}`
      );
      expect(mockDocumentAnalysisService.getConversationHistory).toHaveBeenCalledWith(
        conversationId,
        userId,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: null,
      });
    });
  });
});