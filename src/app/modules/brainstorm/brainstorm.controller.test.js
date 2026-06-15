import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { brainstormController } from './brainstorm.controller.js';

// Mock dependencies
const sendResponse = vi.fn();

const {
  logger,
  mockSubscriptionModel
} = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };
  const mockSubscriptionModel = {
    findOne: vi.fn().mockReturnThis(), // findOne returns itself for chaining
    sort: vi.fn().mockResolvedValue(mockSubscription), // sort returns the mock subscription
  };

  return {
    logger,
    mockSubscriptionModel
  };
});

const brainstormService = {
  generateGuestUserId: vi.fn(),
  processConversationalBrainstorm: vi.fn(),
  generateStructuredBrainstorm: vi.fn(),
  getConversationHistory: vi.fn(),
  exportBrainstormSession: vi.fn(),
  refineBrainstorm: vi.fn(),
};

// Mock SubscriptionModel with chaining
const mockSubscription = {
  usage: 10, // Default usage for tests
};

// Mock catchAsync to simply return the function it wraps, allowing direct testing
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: sendResponse,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger,
}));

vi.mock('./brainstorm.service.js', () => ({
  brainstormService,
}));

vi.mock('../payment/payment.model.js', () => ({
  default: mockSubscriptionModel,
}));

// conversationHelpers is imported but not used in the controller, so no need to mock its methods.

describe('brainstormController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    req = {
      body: {},
      params: {},
      user: null,
      isGuest: false,
    };
    res = {}; // sendResponse handles the response, so `res` itself doesn't need methods like `status`, `json`
  });

  describe('conversationalAssistant', () => {
    it('should process a conversational brainstorm for an authenticated user with a valid subscription', async () => {
      req.user = { userId: 'user123' };
      req.body = { message: 'Hello AI', conversationId: 'conv123' };
      brainstormService.processConversationalBrainstorm.mockResolvedValue({
        response: 'AI response',
      });
      mockSubscriptionModel.sort.mockResolvedValueOnce({ usage: 5 }); // User has usage left

      await brainstormController.conversationalAssistant(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Brainstorm assistant request from authenticated user user123',
        { conversationId: 'conv123' }
      );
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
      expect(mockSubscriptionModel.sort).toHaveBeenCalledWith({
        createdAt: -1,
      });
      expect(brainstormService.processConversationalBrainstorm).toHaveBeenCalledWith(
        'user123',
        'Hello AI',
        'conv123',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: { response: 'AI response' },
      });
    });

    it('should process a conversational brainstorm for a guest user', async () => {
      req.isGuest = true;
      req.body = { message: 'Guest prompt' };
      brainstormService.generateGuestUserId.mockReturnValue('guest456');
      brainstormService.processConversationalBrainstorm.mockResolvedValue({
        response: 'Guest AI response',
      });

      await brainstormController.conversationalAssistant(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Brainstorm assistant request from guest user guest456',
        { conversationId: undefined }
      );
      expect(brainstormService.generateGuestUserId).toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled(); // No subscription check for guests
      expect(brainstormService.processConversationalBrainstorm).toHaveBeenCalledWith(
        'guest456',
        'Guest prompt',
        undefined,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: { response: 'Guest AI response' },
      });
    });

    it('should return 403 if authenticated user has no subscription', async () => {
      req.user = { userId: 'user123' };
      req.body = { message: 'Hello AI' };
      mockSubscriptionModel.sort.mockResolvedValueOnce(null); // No subscription found

      await brainstormController.conversationalAssistant(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Brainstorm assistant request from authenticated user user123',
        { conversationId: undefined }
      );
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
      expect(brainstormService.processConversationalBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 403 if authenticated user has reached usage limit', async () => {
      req.user = { userId: 'user123' };
      req.body = { message: 'Hello AI' };
      mockSubscriptionModel.sort.mockResolvedValueOnce({ usage: 0 }); // Usage is 0

      await brainstormController.conversationalAssistant(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Brainstorm assistant request from authenticated user user123',
        { conversationId: undefined }
      );
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
      expect(brainstormService.processConversationalBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 400 if message is missing', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123' }; // Missing message

      await brainstormController.conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
      expect(brainstormService.processConversationalBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 500 if userId cannot be determined', async () => {
      req.isGuest = true;
      req.body = { message: 'Guest prompt' };
      brainstormService.generateGuestUserId.mockReturnValue(null); // Simulate failure to generate guest ID

      await brainstormController.conversationalAssistant(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(brainstormService.processConversationalBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 500 if brainstormService throws an error', async () => {
      req.user = { userId: 'user123' };
      req.body = { message: 'Error prompt' };
      const errorMessage = 'Service failed';
      brainstormService.processConversationalBrainstorm.mockRejectedValue(
        new Error(errorMessage)
      );
      mockSubscriptionModel.sort.mockResolvedValueOnce({ usage: 5 });

      await brainstormController.conversationalAssistant(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error in conversational assistant:',
        expect.any(Error)
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('generateBrainstorm', () => {
    it('should generate a structured brainstorm for an authenticated user with a valid subscription', async () => {
      req.user = { userId: 'user123' };
      req.body = { topic: 'New Ideas', numIdeas: 3 };
      brainstormService.generateStructuredBrainstorm.mockResolvedValue({
        ideas: ['Idea 1', 'Idea 2'],
      });
      mockSubscriptionModel.sort.mockResolvedValueOnce({ usage: 5 });

      await brainstormController.generateBrainstorm(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Structured brainstorm request from authenticated user user123'
      );
      expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({
        userId: 'user123',
      });
      expect(mockSubscriptionModel.sort).toHaveBeenCalledWith({
        createdAt: -1,
      });
      expect(brainstormService.generateStructuredBrainstorm).toHaveBeenCalledWith(
        'user123',
        { topic: 'New Ideas', numIdeas: 3 },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorm generated successfully',
        data: { ideas: ['Idea 1', 'Idea 2'] },
      });
    });

    it('should generate a structured brainstorm for a guest user', async () => {
      req.isGuest = true;
      req.body = { topic: 'Guest Topic' };
      brainstormService.generateGuestUserId.mockReturnValue('guest789');
      brainstormService.generateStructuredBrainstorm.mockResolvedValue({
        ideas: ['Guest Idea'],
      });

      await brainstormController.generateBrainstorm(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Structured brainstorm request from guest user guest789'
      );
      expect(brainstormService.generateGuestUserId).toHaveBeenCalled();
      expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled();
      expect(brainstormService.generateStructuredBrainstorm).toHaveBeenCalledWith(
        'guest789',
        { topic: 'Guest Topic' },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorm generated successfully',
        data: { ideas: ['Guest Idea'] },
      });
    });

    it('should return 403 if authenticated user has no subscription', async () => {
      req.user = { userId: 'user123' };
      req.body = { topic: 'New Ideas' };
      mockSubscriptionModel.sort.mockResolvedValueOnce(null);

      await brainstormController.generateBrainstorm(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
      expect(brainstormService.generateStructuredBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 403 if authenticated user has reached usage limit', async () => {
      req.user = { userId: 'user123' };
      req.body = { topic: 'New Ideas' };
      mockSubscriptionModel.sort.mockResolvedValueOnce({ usage: 0 });

      await brainstormController.generateBrainstorm(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your brainstorm limit for this month. Please upgrade your plan to continue.',
      });
      expect(brainstormService.generateStructuredBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 500 if userId cannot be determined', async () => {
      req.isGuest = true;
      req.body = { topic: 'Guest Topic' };
      brainstormService.generateGuestUserId.mockReturnValue(null);

      await brainstormController.generateBrainstorm(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(brainstormService.generateStructuredBrainstorm).not.toHaveBeenCalled();
    });

    it('should return 500 if brainstormService throws an error', async () => {
      req.user = { userId: 'user123' };
      req.body = { topic: 'Error Topic' };
      const errorMessage = 'Structured generation failed';
      brainstormService.generateStructuredBrainstorm.mockRejectedValue(
        new Error(errorMessage)
      );
      mockSubscriptionModel.sort.mockResolvedValueOnce({ usage: 5 });

      await brainstormController.generateBrainstorm(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error generating structured brainstorm:',
        expect.any(Error)
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history for an authenticated user', async () => {
      req.user = { userId: 'user123' };
      req.params = { conversationId: 'conv123' };
      brainstormService.getConversationHistory.mockResolvedValue([
        { role: 'user', content: 'Hi' },
      ]);

      await brainstormController.getConversationHistory(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Fetching conversation history for conv123'
      );
      expect(brainstormService.getConversationHistory).toHaveBeenCalledWith(
        'conv123',
        'user123',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: [{ role: 'user', content: 'Hi' }],
      });
    });

    it('should return 500 if brainstormService throws an error', async () => {
      req.user = { userId: 'user123' };
      req.params = { conversationId: 'conv123' };
      const errorMessage = 'History fetch failed';
      brainstormService.getConversationHistory.mockRejectedValue(
        new Error(errorMessage)
      );

      await brainstormController.getConversationHistory(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting conversation history:',
        expect.any(Error)
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });

    it('should return custom status code if error has one', async () => {
      req.user = { userId: 'user123' };
      req.params = { conversationId: 'conv123' };
      const customError = new Error('Not found');
      customError.statusCode = httpStatus.NOT_FOUND;
      brainstormService.getConversationHistory.mockRejectedValue(customError);

      await brainstormController.getConversationHistory(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Not found',
      });
    });
  });

  describe('exportBrainstorm', () => {
    it('should export a brainstorm session for an authenticated user', async () => {
      req.user = { userId: 'user123' };
      req.body = {
        conversationId: 'conv123',
        format: 'json',
        includeHistory: false,
      };
      brainstormService.exportBrainstormSession.mockResolvedValue(
        '{"exportedData": "json"}'
      );

      await brainstormController.exportBrainstorm(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Exporting brainstorm session conv123 as json'
      );
      expect(brainstormService.exportBrainstormSession).toHaveBeenCalledWith(
        'conv123',
        'user123',
        'json',
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorm session exported successfully',
        data: '{"exportedData": "json"}',
      });
    });

    it('should use default format and includeHistory if not provided', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123' }; // Missing format, includeHistory
      brainstormService.exportBrainstormSession.mockResolvedValue(
        '# Exported Markdown'
      );

      await brainstormController.exportBrainstorm(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Exporting brainstorm session conv123 as markdown'
      );
      expect(brainstormService.exportBrainstormSession).toHaveBeenCalledWith(
        'conv123',
        'user123',
        'markdown', // Default
        true, // Default
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorm session exported successfully',
        data: '# Exported Markdown',
      });
    });

    it('should return 500 if brainstormService throws an error', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123' };
      const errorMessage = 'Export failed';
      brainstormService.exportBrainstormSession.mockRejectedValue(
        new Error(errorMessage)
      );

      await brainstormController.exportBrainstorm(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error exporting brainstorm session:',
        expect.any(Error)
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });

    it('should return custom status code if error has one', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123' };
      const customError = new Error('Conversation not found');
      customError.statusCode = httpStatus.NOT_FOUND;
      brainstormService.exportBrainstormSession.mockRejectedValue(customError);

      await brainstormController.exportBrainstorm(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    });
  });

  describe('refineBrainstorm', () => {
    it('should refine a brainstorm session for an authenticated user', async () => {
      req.user = { userId: 'user123' };
      req.body = {
        conversationId: 'conv123',
        message: 'Refine this idea',
        focusOn: ['keywords'],
      };
      brainstormService.refineBrainstorm.mockResolvedValue({
        refinedData: 'new ideas',
      });

      await brainstormController.refineBrainstorm(req, res);

      expect(logger.info).toHaveBeenCalledWith(
        'Refining brainstorm in conversation conv123'
      );
      expect(brainstormService.refineBrainstorm).toHaveBeenCalledWith(
        'conv123',
        'user123',
        'Refine this idea',
        ['keywords'],
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorm refined successfully',
        data: { refinedData: 'new ideas' },
      });
    });

    it('should use default empty array for focusOn if not provided', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123', message: 'Refine this idea' }; // Missing focusOn
      brainstormService.refineBrainstorm.mockResolvedValue({
        refinedData: 'new ideas',
      });

      await brainstormController.refineBrainstorm(req, res);

      expect(brainstormService.refineBrainstorm).toHaveBeenCalledWith(
        'conv123',
        'user123',
        'Refine this idea',
        [], // Default
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Brainstorm refined successfully',
        data: { refinedData: 'new ideas' },
      });
    });

    it('should return 500 if brainstormService throws an error', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123', message: 'Refine this idea' };
      const errorMessage = 'Refinement failed';
      brainstormService.refineBrainstorm.mockRejectedValue(
        new Error(errorMessage)
      );

      await brainstormController.refineBrainstorm(req, res);

      expect(logger.error).toHaveBeenCalledWith(
        'Error refining brainstorm:',
        expect.any(Error)
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });

    it('should return custom status code if error has one', async () => {
      req.user = { userId: 'user123' };
      req.body = { conversationId: 'conv123', message: 'Refine this idea' };
      const customError = new Error('Conversation not found for refinement');
      customError.statusCode = httpStatus.NOT_FOUND;
      brainstormService.refineBrainstorm.mockRejectedValue(customError);

      await brainstormController.refineBrainstorm(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found for refinement',
      });
    });
  });
});