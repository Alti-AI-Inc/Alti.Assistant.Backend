import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { conversationalAssistant, reviewDocument, getConversationHistory } from './document_review.controller.js';

// Mock external dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn, // catchAsync just passes the function through for testing
}));

const sendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));

const logger = {
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger,
}));

const documentReviewService = {
  generateGuestUserId: vi.fn(),
  processConversationalRequest: vi.fn(),
  reviewDocument: vi.fn(),
};
vi.mock('./document_review.service.js', () => ({
  documentReviewService,
}));

const SubscriptionModel = {
  findOne: vi.fn(),
};
vi.mock('../subscription/subscription.model.js', () => ({
  default: SubscriptionModel,
}));

const conversationHelpers = {
  getConversationById: vi.fn(),
};
vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers,
}));

describe('Document Review Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      file: undefined,
      user: undefined,
      isGuest: false,
    };
    res = {}; // sendResponse directly uses res, so no need for mock methods like status/json
    sendResponse.mockClear();
    logger.info.mockClear();
    logger.error.mockClear();
    documentReviewService.generateGuestUserId.mockClear();
    documentReviewService.processConversationalRequest.mockClear();
    documentReviewService.reviewDocument.mockClear();
    SubscriptionModel.findOne.mockClear();
    conversationHelpers.getConversationById.mockClear();

    // Mock chainable methods for SubscriptionModel.findOne
    SubscriptionModel.findOne.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null), // Default: no subscription found
    });
  });

  describe('conversationalAssistant', () => {
    it('should handle guest user request without file and return success', async () => {
      req.isGuest = true;
      req.body = { message: 'Hello, review this document.' };
      documentReviewService.generateGuestUserId.mockReturnValue('guest-123');
      documentReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv-1',
        success: true,
        needsFile: false,
        needsMoreInfo: false,
        response: 'Processed guest request.',
      });

      await conversationalAssistant(req, res);

      expect(documentReviewService.generateGuestUserId).toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
      expect(documentReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'guest-123',
        'Hello, review this document.',
        undefined,
        null,
        true
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          conversationId: 'conv-1',
          success: true,
          needsFile: false,
          needsMoreInfo: false,
          response: 'Processed guest request.',
          userId: 'guest-123',
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Document review assistant request from guest user guest-123',
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Document review assistant response:',
        expect.any(Object)
      );
    });

    it('should handle authenticated user request with file and sufficient subscription', async () => {
      req.user = { userId: 'user-456' };
      req.body = { message: 'Review this file.', conversationId: 'conv-123' };
      req.file = {
        filename: 'test.pdf',
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/uploads/test.pdf',
        location: 's3://bucket/test.pdf',
      };

      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-456', usage: 10 }), // Sufficient usage
      });
      conversationHelpers.getConversationById.mockResolvedValue({ messages: ['msg1'] }); // 1 conversation
      documentReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv-123',
        success: true,
        response: 'Processed authenticated request with file.',
      });

      await conversationalAssistant(req, res);

      expect(documentReviewService.generateGuestUserId).not.toHaveBeenCalled();
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-456' });
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith('conv-123', 'user-456', req);
      expect(documentReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'user-456',
        'Review this file.',
        'conv-123',
        {
          filename: 'test.pdf',
          originalName: 'test.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          path: '/uploads/test.pdf',
          location: 's3://bucket/test.pdf',
        },
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          conversationId: 'conv-123',
          success: true,
          response: 'Processed authenticated request with file.',
          userId: undefined, // Not returned for authenticated users
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Document review assistant request from authenticated user user-456',
        expect.any(Object)
      );
    });

    it('should return FORBIDDEN if authenticated user exceeds document review limit', async () => {
      req.user = { userId: 'user-789' };
      req.body = { message: 'Review this file.', conversationId: 'conv-456' };

      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-789', usage: 1 }), // Usage limit 1
      });
      conversationHelpers.getConversationById.mockResolvedValue({ messages: ['msg1', 'msg2'] }); // 2 conversations, exceeds limit

      await conversationalAssistant(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-789' });
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith('conv-456', 'user-789', req);
      expect(documentReviewService.processConversationalRequest).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document review limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should return BAD_REQUEST if message is missing', async () => {
      req.user = { userId: 'user-101' };
      req.body = {}; // No message

      await conversationalAssistant(req, res);

      expect(documentReviewService.processConversationalRequest).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
    });

    it('should return INTERNAL_SERVER_ERROR if userId generation fails for guest', async () => {
      req.isGuest = true;
      req.body = { message: 'Test message' };
      documentReviewService.generateGuestUserId.mockReturnValue(null); // Simulate failure

      await conversationalAssistant(req, res);

      expect(documentReviewService.generateGuestUserId).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
    });

    it('should return INTERNAL_SERVER_ERROR on service error', async () => {
      req.user = { userId: 'user-err' };
      req.body = { message: 'Error test' };
      const serviceError = new Error('Service failed');
      serviceError.statusCode = httpStatus.BAD_GATEWAY;
      documentReviewService.processConversationalRequest.mockRejectedValue(serviceError);

      await conversationalAssistant(req, res);

      expect(documentReviewService.processConversationalRequest).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error in conversational assistant:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_GATEWAY,
        success: false,
        message: 'Service failed',
        data: {
          conversationId: undefined,
          error: 'Service failed',
          userId: undefined,
        },
      });
    });

    it('should use userId from req.body if provided', async () => {
      req.user = { userId: 'user-from-token' };
      req.body = { message: 'Test message', conversationId: 'conv-body-id', userId: 'user-from-body' };
      documentReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv-body-id',
        success: true,
        response: 'Processed.',
      });
      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-from-body', usage: 10 }),
      });
      conversationHelpers.getConversationById.mockResolvedValue({ messages: [] });

      await conversationalAssistant(req, res);

      expect(documentReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'user-from-body', // Should use userId from body
        'Test message',
        'conv-body-id',
        null,
        false
      );
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-from-body' });
    });

    it('should handle req.user._id if userId is not present', async () => {
      req.user = { _id: 'user-mongo-id' };
      req.body = { message: 'Test message' };
      documentReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv-1',
        success: true,
        response: 'Processed.',
      });
      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-mongo-id', usage: 10 }),
      });
      conversationHelpers.getConversationById.mockResolvedValue({ messages: [] });

      await conversationalAssistant(req, res);

      expect(documentReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'user-mongo-id',
        'Test message',
        undefined,
        null,
        false
      );
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-mongo-id' });
    });
  });

  describe('reviewDocument', () => {
    const mockFile = {
      filename: 'doc.pdf',
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      size: 2048,
      path: '/uploads/doc.pdf',
      location: 's3://bucket/doc.pdf',
    };
    const mockReviewParams = {
      reviewType: 'summary',
      reviewDepth: 'deep',
      documentType: 'contract',
      aspects: ['legal', 'financial'],
      additionalInstructions: 'Focus on liabilities.',
    };

    it('should handle guest user direct review with file and return success', async () => {
      req.isGuest = true;
      req.file = mockFile;
      req.body = { ...mockReviewParams };
      documentReviewService.generateGuestUserId.mockReturnValue('guest-doc-1');
      documentReviewService.reviewDocument.mockResolvedValue({
        reviewResult: 'Document summarized.',
        success: true,
      });

      await reviewDocument(req, res);

      expect(documentReviewService.generateGuestUserId).toHaveBeenCalled();
      expect(SubscriptionModel.findOne).not.toHaveBeenCalled();
      expect(documentReviewService.reviewDocument).toHaveBeenCalledWith(
        {
          filename: 'doc.pdf',
          originalName: 'document.pdf',
          mimetype: 'application/pdf',
          size: 2048,
          path: '/uploads/doc.pdf',
          location: 's3://bucket/doc.pdf',
        },
        mockReviewParams,
        'guest-doc-1',
        true,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Document reviewed successfully',
        data: {
          reviewResult: 'Document summarized.',
          success: true,
          userId: 'guest-doc-1',
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Direct document review request',
        expect.objectContaining({ userId: 'guest-doc-1', filename: 'document.pdf' })
      );
    });

    it('should handle authenticated user direct review with file and sufficient subscription', async () => {
      req.user = { userId: 'user-doc-2' };
      req.file = mockFile;
      req.body = { ...mockReviewParams };

      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-doc-2', usage: 5 }), // Sufficient usage
      });
      documentReviewService.reviewDocument.mockResolvedValue({
        reviewResult: 'Document reviewed for user.',
        success: true,
      });

      await reviewDocument(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-doc-2' });
      expect(documentReviewService.reviewDocument).toHaveBeenCalledWith(
        expect.any(Object),
        mockReviewParams,
        'user-doc-2',
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Document reviewed successfully',
        data: {
          reviewResult: 'Document reviewed for user.',
          success: true,
          userId: undefined,
        },
      });
    });

    it('should return FORBIDDEN if authenticated user exceeds direct review limit', async () => {
      req.user = { userId: 'user-doc-3' };
      req.file = mockFile;
      req.body = { ...mockReviewParams };

      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-doc-3', usage: 0 }), // No usage left
      });

      await reviewDocument(req, res);

      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-doc-3' });
      expect(documentReviewService.reviewDocument).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document review limit for this month. Please upgrade your plan to continue.',
      });
    });

    it('should return BAD_REQUEST if file is missing', async () => {
      req.user = { userId: 'user-doc-4' };
      req.body = { ...mockReviewParams }; // No file

      await reviewDocument(req, res);

      expect(documentReviewService.reviewDocument).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Document file is required',
      });
    });

    it('should return INTERNAL_SERVER_ERROR on service error', async () => {
      req.user = { userId: 'user-doc-err' };
      req.file = mockFile;
      req.body = { ...mockReviewParams };
      const serviceError = new Error('Review service failed');
      serviceError.statusCode = httpStatus.SERVICE_UNAVAILABLE;
      documentReviewService.reviewDocument.mockRejectedValue(serviceError);

      await reviewDocument(req, res);

      expect(documentReviewService.reviewDocument).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error in direct document review:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.SERVICE_UNAVAILABLE,
        success: false,
        message: 'Review service failed',
        data: {
          userId: undefined,
        },
      });
    });

    it('should use userId from req.body if provided for direct review', async () => {
      req.user = { userId: 'user-from-token' };
      req.file = mockFile;
      req.body = { ...mockReviewParams, userId: 'user-from-body' };
      documentReviewService.reviewDocument.mockResolvedValue({
        reviewResult: 'Processed.',
        success: true,
      });
      SubscriptionModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ userId: 'user-from-body', usage: 10 }),
      });

      await reviewDocument(req, res);

      expect(documentReviewService.reviewDocument).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'user-from-body', // Should use userId from body
        false,
        req
      );
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'user-from-body' });
    });
  });

  describe('getConversationHistory', () => {
    it('should return conversation history for an authenticated user', async () => {
      req.user = { userId: 'user-conv-1' };
      req.params = { conversationId: 'conv-history-1' };
      const mockConversation = {
        conversationId: 'conv-history-1',
        title: 'Test Conversation',
        messages: [{ role: 'user', content: 'Hi' }],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv-history-1',
        'user-conv-1',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: {
          conversationId: mockConversation.conversationId,
          title: mockConversation.title,
          messages: mockConversation.messages,
          metadata: mockConversation.metadata,
          createdAt: mockConversation.createdAt,
          updatedAt: mockConversation.updatedAt,
        },
      });
    });

    it('should return UNAUTHORIZED if user is not authenticated', async () => {
      req.user = undefined; // No user
      req.params = { conversationId: 'conv-history-2' };

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return NOT_FOUND if conversation is not found', async () => {
      req.user = { userId: 'user-conv-3' };
      req.params = { conversationId: 'non-existent-conv' };
      conversationHelpers.getConversationById.mockResolvedValue(null);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'non-existent-conv',
        'user-conv-3',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    });

    it('should return INTERNAL_SERVER_ERROR on service error', async () => {
      req.user = { userId: 'user-conv-err' };
      req.params = { conversationId: 'conv-error' };
      const serviceError = new Error('DB error');
      conversationHelpers.getConversationById.mockRejectedValue(serviceError);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversation history:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to fetch conversation history',
      });
    });
  });
});