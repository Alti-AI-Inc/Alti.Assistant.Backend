import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { conversationalAssistant, reviewContract, getConversationHistory } from './legal_contract_review.controller.js';

// Mock shared utilities
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn, // catchAsync just returns the function for testing
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

// Mock service dependencies
const legalContractReviewService = {
  generateGuestUserId: vi.fn(),
  processConversationalRequest: vi.fn(),
  reviewContract: vi.fn(),
};
vi.mock('./legal_contract_review.service.js', () => ({
  legalContractReviewService,
}));

const conversationHelpers = {
  getConversationById: vi.fn(),
};
vi.mock('../../conversations/conversation.helpers.js', () => ({ // Assuming path based on common module structure
  conversationHelpers,
}));

describe('Legal Contract Review Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      file: undefined,
      user: undefined,
      isGuest: false,
    };
    res = {}; // sendResponse will be called with res, but we don't need to mock its methods directly
    sendResponse.mockClear();
    logger.info.mockClear();
    logger.error.mockClear();
    legalContractReviewService.generateGuestUserId.mockClear();
    legalContractReviewService.processConversationalRequest.mockClear();
    legalContractReviewService.reviewContract.mockClear();
    conversationHelpers.getConversationById.mockClear();
  });

  describe('conversationalAssistant', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = { conversationId: 'conv123' };

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
      expect(logger.info).toHaveBeenCalled(); // Initial log
      expect(logger.error).not.toHaveBeenCalled();
      expect(legalContractReviewService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_SERVER_ERROR if userId cannot be determined (e.g., guest user ID generation fails)', async () => {
      req.isGuest = true;
      req.body = { message: 'Hello' };
      legalContractReviewService.generateGuestUserId.mockReturnValue(null); // Simulate failure

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(legalContractReviewService.generateGuestUserId).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled(); // Initial log
      expect(logger.error).not.toHaveBeenCalled();
      expect(legalContractReviewService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should process request for an authenticated user without a file successfully', async () => {
      req.user = { userId: 'auth123' };
      req.body = { message: 'Review this contract', conversationId: 'conv123', outputFormat: 'json' };
      legalContractReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv123',
        response: 'Processed',
        success: true,
        needsContract: false,
        needsMoreInfo: false,
      });

      await conversationalAssistant(req, res);

      expect(legalContractReviewService.generateGuestUserId).not.toHaveBeenCalled();
      expect(legalContractReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'auth123',
        'Review this contract',
        'conv123',
        null,
        'json',
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          conversationId: 'conv123',
          response: 'Processed',
          success: true,
          needsContract: false,
          needsMoreInfo: false,
          userId: undefined, // Not included for authenticated users
        },
      });
      expect(logger.info).toHaveBeenCalledTimes(2); // Initial log + response log
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should process request for a guest user with a file successfully', async () => {
      req.isGuest = true;
      req.body = { message: 'Analyze this document', outputFormat: 'text' };
      req.file = {
        filename: 'contract.pdf',
        originalname: 'contract.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        path: '/uploads/contract.pdf',
        location: 's3://bucket/contract.pdf',
      };
      legalContractReviewService.generateGuestUserId.mockReturnValue('guest456');
      legalContractReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'new_conv',
        response: 'File analyzed',
        success: true,
        needsContract: false,
        needsMoreInfo: false,
      });

      await conversationalAssistant(req, res);

      expect(legalContractReviewService.generateGuestUserId).toHaveBeenCalled();
      expect(legalContractReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'guest456',
        'Analyze this document',
        undefined, // conversationId is not provided in req.body
        {
          filename: 'contract.pdf',
          originalName: 'contract.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          path: '/uploads/contract.pdf',
          location: 's3://bucket/contract.pdf',
        },
        'text',
        true
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          conversationId: 'new_conv',
          response: 'File analyzed',
          success: true,
          needsContract: false,
          needsMoreInfo: false,
          userId: 'guest456', // Included for guest users
        },
      });
      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should use userId from body if provided, even for authenticated user', async () => {
      req.user = { userId: 'auth123' };
      req.body = { message: 'Test message', userId: 'customUser789' };
      legalContractReviewService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv123',
        response: 'Processed',
        success: true,
        needsContract: false,
        needsMoreInfo: false,
      });

      await conversationalAssistant(req, res);

      expect(legalContractReviewService.processConversationalRequest).toHaveBeenCalledWith(
        'customUser789',
        'Test message',
        undefined,
        null,
        'text', // default outputFormat
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, expect.objectContaining({
        statusCode: httpStatus.OK,
        data: expect.objectContaining({ userId: undefined }), // Still undefined in response for authenticated
      }));
    });

    it('should handle errors from the service gracefully', async () => {
      req.user = { userId: 'auth123' };
      req.body = { message: 'Error test' };
      const serviceError = new Error('Service failed');
      serviceError.statusCode = httpStatus.FORBIDDEN;
      legalContractReviewService.processConversationalRequest.mockRejectedValue(serviceError);

      await conversationalAssistant(req, res);

      expect(legalContractReviewService.processConversationalRequest).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'Service failed',
      });
      expect(logger.info).toHaveBeenCalledTimes(1); // Only initial log
      expect(logger.error).toHaveBeenCalledWith('Error in conversational assistant:', serviceError);
    });

    it('should handle generic errors from the service gracefully', async () => {
      req.user = { userId: 'auth123' };
      req.body = { message: 'Generic error test' };
      const genericError = new Error('Something went wrong');
      legalContractReviewService.processConversationalRequest.mockRejectedValue(genericError);

      await conversationalAssistant(req, res);

      expect(legalContractReviewService.processConversationalRequest).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Something went wrong',
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error in conversational assistant:', genericError);
    });
  });

  describe('reviewContract', () => {
    it('should return BAD_REQUEST if neither file nor contractText is provided', async () => {
      req.user = { userId: 'auth123' };
      req.body = {};

      await reviewContract(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Contract file or contract text is required',
      });
      expect(logger.info).toHaveBeenCalled(); // Initial log
      expect(logger.error).not.toHaveBeenCalled();
      expect(legalContractReviewService.reviewContract).not.toHaveBeenCalled();
    });

    it('should process direct review with a file for an authenticated user successfully', async () => {
      req.user = { userId: 'auth123' };
      req.file = {
        filename: 'contract.docx',
        originalname: 'contract.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 2048,
        path: '/uploads/contract.docx',
      };
      req.body = { reviewType: 'summary', outputFormat: 'json' };
      legalContractReviewService.reviewContract.mockResolvedValue({
        summary: 'Contract summarized',
        success: true,
      });

      await reviewContract(req, res);

      expect(legalContractReviewService.generateGuestUserId).not.toHaveBeenCalled();
      expect(legalContractReviewService.reviewContract).toHaveBeenCalledWith(
        {
          filename: 'contract.docx',
          originalName: 'contract.docx',
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 2048,
          path: '/uploads/contract.docx',
          location: '/uploads/contract.docx', // path is used as location if location is not present
        },
        { reviewType: 'summary', outputFormat: 'json' },
        'auth123',
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Contract review completed successfully',
        data: {
          summary: 'Contract summarized',
          success: true,
        },
      });
      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should process direct review with contract text for a guest user successfully', async () => {
      req.isGuest = true;
      req.body = { contractText: 'This is a sample contract.', reviewType: 'risk_analysis' };
      legalContractReviewService.generateGuestUserId.mockReturnValue('guest789');
      legalContractReviewService.reviewContract.mockResolvedValue({
        risks: ['Risk A', 'Risk B'],
        success: true,
      });

      await reviewContract(req, res);

      expect(legalContractReviewService.generateGuestUserId).toHaveBeenCalled();
      expect(legalContractReviewService.reviewContract).toHaveBeenCalledWith(
        null,
        { contractText: 'This is a sample contract.', reviewType: 'risk_analysis' },
        'guest789',
        true
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Contract review completed successfully',
        data: {
          risks: ['Risk A', 'Risk B'],
          success: true,
        },
      });
      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle errors from the service gracefully during direct review', async () => {
      req.user = { userId: 'auth123' };
      req.body = { contractText: 'Error contract' };
      const serviceError = new Error('Review service failed');
      serviceError.statusCode = httpStatus.SERVICE_UNAVAILABLE;
      legalContractReviewService.reviewContract.mockRejectedValue(serviceError);

      await reviewContract(req, res);

      expect(legalContractReviewService.reviewContract).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.SERVICE_UNAVAILABLE,
        success: false,
        message: 'Review service failed',
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error in direct contract review:', serviceError);
    });

    it('should handle generic errors from the service gracefully during direct review', async () => {
      req.user = { userId: 'auth123' };
      req.body = { contractText: 'Generic error contract' };
      const genericError = new Error('Unknown review error');
      legalContractReviewService.reviewContract.mockRejectedValue(genericError);

      await reviewContract(req, res);

      expect(legalContractReviewService.reviewContract).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Unknown review error',
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error in direct contract review:', genericError);
    });
  });

  describe('getConversationHistory', () => {
    it('should return NOT_FOUND if conversation is not found', async () => {
      req.user = { userId: 'auth123' };
      req.params = { conversationId: 'nonexistent' };
      conversationHelpers.getConversationById.mockResolvedValue(null);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'nonexistent',
        'auth123',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should retrieve conversation history successfully', async () => {
      req.user = { userId: 'auth123' };
      req.params = { conversationId: 'conv123' };
      const mockConversation = {
        conversationId: 'conv123',
        title: 'My Contract Review',
        messages: [{ role: 'user', content: 'Hi' }],
        metadata: { type: 'legal' },
        contracts_metadata: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv123',
        'auth123',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: mockConversation,
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle errors from the service gracefully during history retrieval', async () => {
      req.user = { userId: 'auth123' };
      req.params = { conversationId: 'error_conv' };
      const serviceError = new Error('DB error');
      serviceError.statusCode = httpStatus.BAD_GATEWAY;
      conversationHelpers.getConversationById.mockRejectedValue(serviceError);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_GATEWAY,
        success: false,
        message: 'DB error',
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversation history:', serviceError);
    });

    it('should handle generic errors from the service gracefully during history retrieval', async () => {
      req.user = { userId: 'auth123' };
      req.params = { conversationId: 'generic_error_conv' };
      const genericError = new Error('Something unexpected happened');
      conversationHelpers.getConversationById.mockRejectedValue(genericError);

      await getConversationHistory(req, res);

      expect(conversationHelpers.getConversationById).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Something unexpected happened',
      });
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith('Error fetching conversation history:', genericError);
    });
  });
});