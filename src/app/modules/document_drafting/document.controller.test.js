import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock shared utilities
// catchAsync should just return the function for direct testing
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
const sendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));

// Mock module-specific dependencies
const mockDocumentService = {
  generateGuestUserId: vi.fn(),
  processConversationalRequest: vi.fn(),
  generateDocument: vi.fn(),
};
vi.mock('./document.service.js', () => ({
  documentService: mockDocumentService,
}));

const mockSubscriptionModel = {
  findOne: vi.fn(() => ({
    sort: vi.fn(() => ({
      lean: vi.fn(), // Will be chained and resolved in specific tests
    })),
  })),
};
vi.mock('../payment/payment.model.js', () => ({
  default: mockSubscriptionModel,
}));

const mockConversationHelpers = {
  getConversationById: vi.fn(),
};
vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: mockConversationHelpers,
}));

// Import the functions to be tested
import {
  conversationalAssistant,
  generateDocument,
  exportDocument,
  editDocument,
} from './document.controller.js';

describe('document.controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock request and response objects
    req = {
      isGuest: false,
      user: { userId: 'authUserId', _id: 'authUserId' },
      body: {},
    };
    res = {}; // sendResponse is mocked, so `res` object itself doesn't need methods like .status() or .json()
  });

  describe('conversationalAssistant', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = { conversationId: 'conv123' }; // No message

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
      expect(mockDocumentService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_SERVER_ERROR if userId cannot be determined (guest generation fails)', async () => {
      req.isGuest = true;
      req.user = null; // Simulate guest user
      req.body = { message: 'Hello' };
      mockDocumentService.generateGuestUserId.mockReturnValueOnce(null); // Simulate guest ID generation failure

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(mockDocumentService.generateGuestUserId).toHaveBeenCalled();
      expect(mockDocumentService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_SERVER_ERROR if userId cannot be determined (auth user missing, no body userId)', async () => {
      req.isGuest = false;
      req.user = null; // Simulate authenticated user not logged in
      req.body = { message: 'Hello' }; // No userId in body

      await conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(mockDocumentService.generateGuestUserId).not.toHaveBeenCalled(); // Not a guest
      expect(mockDocumentService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should handle guest user and process request successfully', async () => {
      req.isGuest = true;
      req.user = null;
      req.body = { message: 'Draft a letter.' };
      mockDocumentService.generateGuestUserId.mockReturnValueOnce('guest123');
      mockDocumentService.processConversationalRequest.mockResolvedValueOnce({
        conversationId: 'newConv123',
        success: true,
        needsMoreInfo: false,
        response: 'Here is your draft.',
      });

      await conversationalAssistant(req, res);

      expect(mockDocumentService.generateGuestUserId).toHaveBeenCalled();
      expect(mockDocumentService.processConversationalRequest).toHaveBeenCalledWith(
        'guest123',
        'Draft a letter.',
        undefined, // No conversationId in req.body
        true
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          conversationId: 'newConv123',
          success: true,
          needsMoreInfo: false,
          response: 'Here is your draft.',
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Document assistant request from guest user guest123')
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Document assistant response:',
        expect.objectContaining({ conversationId: 'newConv123', success: true })
      );
    });

    it('should handle authenticated user with sufficient subscription and process request successfully', async () => {
      req.body = { message: 'Draft a contract.', conversationId: 'existingConv456' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'authUserId', usage: 10 })), // 10 prompts available
        })),
      });
      mockConversationHelpers.getConversationById.mockResolvedValueOnce(2); // User has used 2 prompts in this conversation
      mockDocumentService.processConversationalRequest.mockResolvedValueOnce({
        conversationId: 'existingConv456',
        success: true,
        needsMoreInfo: false,
        response: 'Here is your contract.',
      });

      await conversationalAssistant(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'authUserId' });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        'existingConv456',
        'authUserId',
        req
      );
      expect(mockDocumentService.processConversationalRequest).toHaveBeenCalledWith(
        'authUserId',
        'Draft a contract.',
        'existingConv456',
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: {
          conversationId: 'existingConv456',
          success: true,
          needsMoreInfo: false,
          response: 'Here is your contract.',
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Document assistant request from authenticated user authUserId')
      );
    });

    it('should return FORBIDDEN for authenticated user with insufficient subscription', async () => {
      req.body = { message: 'Draft a contract.', conversationId: 'existingConv456' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'authUserId', usage: 2 })), // 2 prompts available
        })),
      });
      mockConversationHelpers.getConversationById.mockResolvedValueOnce(2); // User has used 2 prompts in this conversation

      await conversationalAssistant(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'authUserId' });
      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        'existingConv456',
        'authUserId',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document generation limit for this month. Please upgrade your plan to continue.',
      });
      expect(mockDocumentService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should return FORBIDDEN for authenticated user with no subscription found', async () => {
      req.body = { message: 'Draft a contract.' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve(null)), // No subscription found
        })),
      });
      // getConversationById won't be called if userSubscription is null, promptUsage will be 0

      await conversationalAssistant(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'authUserId' });
      expect(mockConversationHelpers.getConversationById).not.toHaveBeenCalled(); // Because promptUsage will be 0
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document generation limit for this month. Please upgrade your plan to continue.',
      });
      expect(mockDocumentService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should handle errors from documentService.processConversationalRequest', async () => {
      req.body = { message: 'Error case.' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'authUserId', usage: 10 })),
        })),
      });
      mockConversationHelpers.getConversationById.mockResolvedValueOnce(0);
      const mockError = new Error('Processing failed');
      mockError.statusCode = httpStatus.BAD_GATEWAY;
      mockDocumentService.processConversationalRequest.mockRejectedValueOnce(mockError);

      await conversationalAssistant(req, res);

      expect(mockDocumentService.processConversationalRequest).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_GATEWAY,
        success: false,
        message: 'Processing failed',
        data: {
          conversationId: undefined, // No conversationId in req.body
          error: 'Processing failed',
        },
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error in conversational assistant:',
        mockError
      );
    });

    it('should use userId from req.body if provided, overriding req.user', async () => {
      req.isGuest = false;
      req.user = { userId: 'originalUserId' }; // This should be overridden
      req.body = { message: 'Hello', userId: 'bodyUserId' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'bodyUserId', usage: 10 })),
        })),
      });
      mockConversationHelpers.getConversationById.mockResolvedValueOnce(0);
      mockDocumentService.processConversationalRequest.mockResolvedValueOnce({
        conversationId: 'newConv123',
        success: true,
        needsMoreInfo: false,
        response: 'Here is your draft.',
      });

      await conversationalAssistant(req, res);

      expect(mockDocumentService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockDocumentService.processConversationalRequest).toHaveBeenCalledWith(
        'bodyUserId',
        'Hello',
        undefined,
        false
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: expect.any(Object),
      });
    });

    it('should use userId from req.body if provided, overriding guest generation', async () => {
      req.isGuest = true;
      req.user = null;
      req.body = { message: 'Hello', userId: 'bodyGuestId' };
      mockDocumentService.generateGuestUserId.mockReturnValueOnce('generatedGuestId'); // Should not be used
      mockDocumentService.processConversationalRequest.mockResolvedValueOnce({
        conversationId: 'newConv123',
        success: true,
        needsMoreInfo: false,
        response: 'Here is your draft.',
      });

      await conversationalAssistant(req, res);

      expect(mockDocumentService.generateGuestUserId).not.toHaveBeenCalled(); // Because req.body.userId is present
      expect(mockDocumentService.processConversationalRequest).toHaveBeenCalledWith(
        'bodyGuestId',
        'Hello',
        undefined,
        true
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: expect.any(Object),
      });
    });
  });

  describe('generateDocument', () => {
    it('should handle guest user and generate document successfully', async () => {
      req.isGuest = true;
      req.user = null;
      req.body = { documentType: 'contract', content: 'Some content' };
      mockDocumentService.generateGuestUserId.mockReturnValueOnce('guest456');
      mockDocumentService.generateDocument.mockResolvedValueOnce({
        document: { format: 'pdf', url: 'http://example.com/doc.pdf' },
      });

      await generateDocument(req, res);

      expect(mockDocumentService.generateGuestUserId).toHaveBeenCalled();
      expect(mockDocumentService.generateDocument).toHaveBeenCalledWith(
        req.body,
        'guest456',
        true,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Document generated successfully',
        data: {
          document: { format: 'pdf', url: 'http://example.com/doc.pdf' },
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Direct document generation request',
        expect.objectContaining({ userId: 'guest456', documentType: 'contract' })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Document generated successfully',
        expect.objectContaining({ userId: 'guest456', format: 'pdf' })
      );
    });

    it('should handle authenticated user with sufficient subscription and generate document successfully', async () => {
      req.body = { documentType: 'report', content: 'Report data' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'authUserId', usage: 5 })), // 5 prompts available
        })),
      });
      mockDocumentService.generateDocument.mockResolvedValueOnce({
        document: { format: 'docx', url: 'http://example.com/report.docx' },
      });

      await generateDocument(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'authUserId' });
      expect(mockDocumentService.generateDocument).toHaveBeenCalledWith(
        req.body,
        'authUserId',
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Document generated successfully',
        data: {
          document: { format: 'docx', url: 'http://example.com/report.docx' },
        },
      });
    });

    it('should return FORBIDDEN for authenticated user with insufficient subscription (usage <= 0)', async () => {
      req.body = { documentType: 'letter' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'authUserId', usage: 0 })), // 0 prompts available
        })),
      });

      await generateDocument(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'authUserId' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document generation limit. Please upgrade your plan.',
      });
      expect(mockDocumentService.generateDocument).not.toHaveBeenCalled();
    });

    it('should return FORBIDDEN for authenticated user with no subscription found', async () => {
      req.body = { documentType: 'letter' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve(null)), // No subscription found
        })),
      });

      await generateDocument(req, res);

      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({ userId: 'authUserId' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your document generation limit. Please upgrade your plan.',
      });
      expect(mockDocumentService.generateDocument).not.toHaveBeenCalled();
    });

    it('should handle errors from documentService.generateDocument', async () => {
      req.body = { documentType: 'errorDoc' };
      mockSubscriptionModel.findOne.mockReturnValueOnce({
        sort: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({ userId: 'authUserId', usage: 5 })),
        })),
      });
      const mockError = new Error('Generation failed');
      mockError.statusCode = httpStatus.BAD_GATEWAY;
      mockDocumentService.generateDocument.mockRejectedValueOnce(mockError);

      await generateDocument(req, res);

      expect(mockDocumentService.generateDocument).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_GATEWAY,
        success: false,
        message: 'Generation failed',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating document:',
        mockError
      );
    });
  });

  describe('exportDocument', () => {
    it('should return NOT_IMPLEMENTED for any request', async () => {
      req.body = { documentId: 'doc123', outputFormat: 'pdf' };
      mockDocumentService.generateGuestUserId.mockReturnValueOnce('guest789'); // This mock won't be used as it's not implemented

      await exportDocument(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_IMPLEMENTED,
        success: false,
        message: 'Document export from stored documents is not yet implemented. Please use the generate endpoint with your content.',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Document export request',
        expect.objectContaining({ userId: 'authUserId', documentId: 'doc123', outputFormat: 'pdf' })
      );
    });
  });

  describe('editDocument', () => {
    it('should return NOT_IMPLEMENTED for any request', async () => {
      req.body = { documentId: 'doc456', editInstructions: 'Fix grammar', outputFormat: 'docx' };
      mockDocumentService.generateGuestUserId.mockReturnValueOnce('guest012'); // This mock won't be used as it's not implemented

      await editDocument(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_IMPLEMENTED,
        success: false,
        message: 'Document editing is not yet implemented. Please use the conversational assistant for document modifications.',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Document edit request',
        expect.objectContaining({ userId: 'authUserId', documentId: 'doc456' })
      );
    });
  });
});